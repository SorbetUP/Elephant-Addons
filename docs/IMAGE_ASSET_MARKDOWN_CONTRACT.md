# Image add-on Markdown contract

Every image add-on MUST write a normal Markdown image as its durable reference:

```markdown
![Alt text](.assets/example.png)
```

The PNG/JPEG/WebP/SVG reference is the portable rendering artifact. The core
renderer must display it when this add-on is disabled or unavailable. An add-on
may place an optional companion beside the rendered artifact using the same
basename (for example `.assets/example.excalidraw`), but the companion is never
required to render the image and must never replace the Markdown image link.

Add-ons must use vault-relative paths, keep generated files under `.assets`,
and log companion failures without deleting or rewriting the durable image
reference.
