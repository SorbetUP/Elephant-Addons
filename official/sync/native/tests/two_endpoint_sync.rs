use elephant_sync_service::{
  manifest::scan_vault,
  pairing::{
    consume_pair_request, create_pending_invite, parse_invite, read_config, register_accepted_peer,
    write_config,
  },
  protocol::{expect_control, read_control, write_control, ControlMessage, PairRequest, ALPN},
  session::{read_baseline, run_all_sessions, serve_sync_session},
};
use iroh::{
  endpoint::{presets, Connection},
  protocol::{AcceptError, ProtocolHandler, Router},
  Endpoint, EndpointAddr, SecretKey, Watcher as _,
};
use serde_json::to_value;
use std::{fmt, fs, io, path::PathBuf, time::Duration};

#[derive(Clone)]
struct PackageProtocol {
  endpoint: Endpoint,
  vault: PathBuf,
  name: String,
}

impl fmt::Debug for PackageProtocol {
  fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
    formatter.debug_struct("PackageProtocol").finish_non_exhaustive()
  }
}

impl ProtocolHandler for PackageProtocol {
  async fn accept(&self, connection: Connection) -> Result<(), AcceptError> {
    handle_connection(
      self.endpoint.clone(),
      self.vault.clone(),
      self.name.clone(),
      connection,
    )
    .await
    .map_err(|error| AcceptError::from_err(io::Error::other(error)))
  }
}

async fn handle_connection(
  endpoint: Endpoint,
  vault: PathBuf,
  name: String,
  connection: Connection,
) -> Result<(), String> {
  let peer_id = connection.remote_id().to_string();
  let (mut send, mut recv) = connection.accept_bi().await.map_err(|error| error.to_string())?;
  match read_control(&mut recv).await? {
    ControlMessage::PairRequest(request) => {
      if request.endpoint_addr.id != connection.remote_id() {
        return Err("pairing identity mismatch".to_string());
      }
      recv
        .read_to_end(0)
        .await
        .map_err(|error| format!("pairing request did not close cleanly: {error}"))?;
      let accepted = consume_pair_request(&vault, request, endpoint.addr(), &name)?;
      write_control(&mut send, &ControlMessage::PairAccepted(accepted)).await?;
      send
        .finish()
        .map_err(|error| format!("failed to finish pairing response stream: {error}"))?;
      connection.closed().await;
      Ok(())
    }
    ControlMessage::SyncOpen(open) => {
      serve_sync_session(
        &vault,
        &endpoint.id().to_string(),
        peer_id,
        open,
        connection,
        send,
        recv,
      )
      .await?;
      Ok(())
    }
    message => Err(format!(
      "unexpected first package Sync message: {}",
      elephant_sync_service::protocol::message_name(&message)
    )),
  }
}

async fn wait_addr(endpoint: &Endpoint) -> EndpointAddr {
  let mut watcher = endpoint.watch_addr();
  tokio::time::timeout(Duration::from_secs(20), async {
    loop {
      let address = watcher.get();
      if address.ip_addrs().next().is_some() || address.relay_urls().next().is_some() {
        return address;
      }
      watcher.updated().await.expect("endpoint watcher must remain available");
    }
  })
  .await
  .expect("endpoint must publish a dialable address")
}

fn spawn_router(endpoint: &Endpoint, vault: &PathBuf, name: &str) -> Router {
  Router::builder(endpoint.clone())
    .accept(
      ALPN,
      PackageProtocol {
        endpoint: endpoint.clone(),
        vault: vault.clone(),
        name: name.to_string(),
      },
    )
    .spawn()
}

async fn refresh_peer_address(vault: &PathBuf, peer_id: &str, endpoint: &Endpoint) {
  let mut config = read_config(vault).expect("paired Sync config must survive restart");
  let peer = config
    .peers
    .iter_mut()
    .find(|peer| peer.endpoint_id == peer_id)
    .expect("paired peer must survive restart");
  peer.endpoint_addr = Some(wait_addr(endpoint).await);
  write_config(vault, &config).expect("restarted peer address must be persisted");
}

async fn pair(
  inviter_endpoint: &Endpoint,
  inviter_vault: &PathBuf,
  receiver_endpoint: &Endpoint,
  receiver_vault: &PathBuf,
) {
  println!("[Sync] pairing:start");
  let invite = create_pending_invite(
    inviter_vault,
    &inviter_endpoint.id().to_string(),
    wait_addr(inviter_endpoint).await,
    "Device A".to_string(),
    None,
  )
  .expect("invite must be created");
  let parsed = parse_invite(to_value(&invite.invite).unwrap()).unwrap();
  let connection = receiver_endpoint
    .connect(parsed.endpoint_addr.clone(), ALPN)
    .await
    .expect("receiver must connect to inviter");
  let (mut send, mut recv) = connection.open_bi().await.unwrap();
  write_control(
    &mut send,
    &ControlMessage::PairRequest(PairRequest {
      invite_id: parsed.invite_id.clone(),
      invite_token: parsed.invite_token.clone(),
      folder_id: parsed.folder_id.clone(),
      device_name: "Device B".to_string(),
      endpoint_addr: wait_addr(receiver_endpoint).await,
    }),
  )
  .await
  .unwrap();
  send.finish().unwrap();
  let accepted = match expect_control(read_control(&mut recv).await.unwrap(), "pairAccepted").unwrap() {
    ControlMessage::PairAccepted(accepted) => accepted,
    _ => unreachable!(),
  };
  recv.read_to_end(0).await.unwrap();
  connection.close(0_u32.into(), b"pairing-complete");
  register_accepted_peer(
    receiver_vault,
    &receiver_endpoint.id().to_string(),
    &parsed.folder_id,
    accepted,
  )
  .unwrap();
  println!("[Sync] pairing:complete");
}

fn temp_vault(name: &str) -> PathBuf {
  std::env::temp_dir().join(format!(
    "elephant-package-sync-{name}-{}-{}",
    std::process::id(),
    std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .unwrap()
      .as_nanos()
  ))
}

fn conflict_files(vault: &PathBuf) -> Vec<PathBuf> {
  let directory = vault.join(".conflit");
  let mut files = fs::read_dir(directory)
    .expect("conflict directory must exist")
    .map(|entry| entry.unwrap().path())
    .filter(|path| path.is_file())
    .collect::<Vec<_>>();
  files.sort();
  files
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn physical_package_pairs_and_synchronizes_two_real_iroh_endpoints() {
  println!("[Sync] run:start owner=elephant.sync transport=iroh");
  let vault_a = temp_vault("a");
  let vault_b = temp_vault("b");
  fs::create_dir_all(&vault_a).unwrap();
  fs::create_dir_all(&vault_b).unwrap();
  fs::write(vault_a.join("From A.md"), "alpha").unwrap();
  fs::write(vault_b.join("From B.md"), "beta").unwrap();

  let endpoint_a = Endpoint::builder(presets::Minimal).bind().await.unwrap();
  let endpoint_b = Endpoint::builder(presets::Minimal).bind().await.unwrap();
  println!(
    "[Sync] endpoints:ready first={} second={}",
    endpoint_a.id(),
    endpoint_b.id()
  );
  let router_a = spawn_router(&endpoint_a, &vault_a, "Device A");
  let router_b = spawn_router(&endpoint_b, &vault_b, "Device B");

  pair(&endpoint_a, &vault_a, &endpoint_b, &vault_b).await;
  println!("[Sync] session:start direction=bidirectional");
  let sessions = tokio::time::timeout(
    Duration::from_secs(60),
    run_all_sessions(&endpoint_b, &vault_b),
  )
  .await
  .expect("physical package synchronization timed out")
  .expect("physical package synchronization failed");

  assert_eq!(sessions.len(), 1);
  assert_eq!(sessions[0].transferred_files, 2);
  assert!(sessions[0].transferred_bytes >= 9);
  assert!(sessions[0].conflicts.is_empty());
  println!(
    "[Sync] transfer:complete files={} bytes={} conflicts={}",
    sessions[0].transferred_files,
    sessions[0].transferred_bytes,
    sessions[0].conflicts.len()
  );
  assert_eq!(fs::read_to_string(vault_a.join("From B.md")).unwrap(), "beta");
  assert_eq!(fs::read_to_string(vault_b.join("From A.md")).unwrap(), "alpha");

  let manifest_a = scan_vault(&vault_a).unwrap();
  let manifest_b = scan_vault(&vault_b).unwrap();
  assert!(manifest_a.content_equals(&manifest_b));
  println!("[Sync] verify:manifest equal=true");
  assert!(read_baseline(&vault_a, &endpoint_b.id().to_string()).content_equals(&manifest_a));
  assert!(read_baseline(&vault_b, &endpoint_a.id().to_string()).content_equals(&manifest_b));
  assert!(vault_a.join(".elephantnote/sync/sync-manifest.json").is_file());
  assert!(vault_b.join(".elephantnote/sync/sync-manifest.json").is_file());
  println!("[Sync] baseline:saved peers=2");

  drop(router_a);
  drop(router_b);
  endpoint_a.close().await;
  endpoint_b.close().await;
  let _ = fs::remove_dir_all(vault_a);
  let _ = fs::remove_dir_all(vault_b);
  println!("[Sync] run:complete");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn physical_package_survives_restart_and_preserves_concurrent_edits() {
  println!("[Sync] restart-conflict:start owner=elephant.sync transport=iroh");
  let vault_a = temp_vault("restart-a");
  let vault_b = temp_vault("restart-b");
  fs::create_dir_all(&vault_a).unwrap();
  fs::create_dir_all(&vault_b).unwrap();
  fs::write(vault_a.join("Shared.md"), "baseline").unwrap();

  let key_a = SecretKey::generate();
  let key_b = SecretKey::generate();
  let endpoint_a = Endpoint::builder(presets::Minimal)
    .secret_key(key_a.clone())
    .bind()
    .await
    .unwrap();
  let endpoint_b = Endpoint::builder(presets::Minimal)
    .secret_key(key_b.clone())
    .bind()
    .await
    .unwrap();
  let id_a = endpoint_a.id();
  let id_b = endpoint_b.id();
  let router_a = spawn_router(&endpoint_a, &vault_a, "Device A");
  let router_b = spawn_router(&endpoint_b, &vault_b, "Device B");

  pair(&endpoint_a, &vault_a, &endpoint_b, &vault_b).await;
  let initial = tokio::time::timeout(
    Duration::from_secs(60),
    run_all_sessions(&endpoint_b, &vault_b),
  )
  .await
  .expect("initial synchronization timed out")
  .expect("initial synchronization failed");
  assert_eq!(initial[0].transferred_files, 1);
  assert_eq!(fs::read_to_string(vault_b.join("Shared.md")).unwrap(), "baseline");

  drop(router_a);
  drop(router_b);
  endpoint_a.close().await;
  endpoint_b.close().await;

  fs::write(vault_a.join("Shared.md"), "edited on device A").unwrap();
  tokio::time::sleep(Duration::from_millis(30)).await;
  fs::write(vault_b.join("Shared.md"), "edited on device B after restart").unwrap();

  let restarted_a = Endpoint::builder(presets::Minimal)
    .secret_key(key_a)
    .bind()
    .await
    .unwrap();
  let restarted_b = Endpoint::builder(presets::Minimal)
    .secret_key(key_b)
    .bind()
    .await
    .unwrap();
  assert_eq!(restarted_a.id(), id_a);
  assert_eq!(restarted_b.id(), id_b);
  println!("[Sync] restart:stable-identities equal=true");

  refresh_peer_address(&vault_a, &id_b.to_string(), &restarted_b).await;
  refresh_peer_address(&vault_b, &id_a.to_string(), &restarted_a).await;
  let restarted_router_a = spawn_router(&restarted_a, &vault_a, "Device A");
  let restarted_router_b = spawn_router(&restarted_b, &vault_b, "Device B");

  let conflicted = tokio::time::timeout(
    Duration::from_secs(60),
    run_all_sessions(&restarted_b, &vault_b),
  )
  .await
  .expect("post-restart conflict synchronization timed out")
  .expect("post-restart conflict synchronization failed");
  assert_eq!(conflicted.len(), 1);
  assert_eq!(conflicted[0].conflicts, vec!["Shared.md"]);
  assert_eq!(
    fs::read_to_string(vault_a.join("Shared.md")).unwrap(),
    "edited on device B after restart"
  );
  assert_eq!(
    fs::read_to_string(vault_b.join("Shared.md")).unwrap(),
    "edited on device B after restart"
  );
  let conflicts_a = conflict_files(&vault_a);
  let conflicts_b = conflict_files(&vault_b);
  assert_eq!(conflicts_a.len(), 1);
  assert_eq!(conflicts_b.len(), 1);
  assert_eq!(fs::read_to_string(&conflicts_a[0]).unwrap(), "edited on device A");
  assert_eq!(fs::read_to_string(&conflicts_b[0]).unwrap(), "edited on device A");
  println!("[Sync] conflict:preserved files=1 both_vaults=true");

  let manifest_a = scan_vault(&vault_a).unwrap();
  let manifest_b = scan_vault(&vault_b).unwrap();
  assert!(manifest_a.content_equals(&manifest_b));
  assert!(read_baseline(&vault_a, &id_b.to_string()).content_equals(&manifest_a));
  assert!(read_baseline(&vault_b, &id_a.to_string()).content_equals(&manifest_b));

  let no_op = tokio::time::timeout(
    Duration::from_secs(60),
    run_all_sessions(&restarted_b, &vault_b),
  )
  .await
  .expect("post-conflict no-op synchronization timed out")
  .expect("post-conflict no-op synchronization failed");
  assert_eq!(no_op[0].transferred_files, 0);
  assert!(no_op[0].conflicts.is_empty());
  println!("[Sync] restart:resync files=0 conflicts=0");

  drop(restarted_router_a);
  drop(restarted_router_b);
  restarted_a.close().await;
  restarted_b.close().await;
  let _ = fs::remove_dir_all(vault_a);
  let _ = fs::remove_dir_all(vault_b);
  println!("[Sync] restart-conflict:complete");
}
