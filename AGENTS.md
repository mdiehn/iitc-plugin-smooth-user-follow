# Agent notes

This repo contains a standalone IITC helper plugin that improves user-location
follow behavior.

Important constraints:

- Do not implement Portal Route follow mode here.
- Keep GPS/user-marker updates separate from map camera movement.
- Keep Intel fetch behavior separate from local smooth map movement.
- Keep heading-up and viewport-bias behavior easy to turn off.
- Prefer small, reviewable changes.

Primary source file:

```text
src/follow-mode.js
```

Build output:

```text
dist/follow-mode.user.js
dist/follow-mode.meta.js
```
