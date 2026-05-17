# Agent notes

This repo contains a standalone IITC helper plugin.

Important constraints:

- Do not implement Portal Route follow mode here.
- Keep GPS/user-marker updates separate from map camera movement.
- Do not add viewport biasing in the first pass.
- Avoid triggering excessive Intel refreshes: keep camera panning thresholded and rate-limited.
- Prefer small, reviewable changes.

Primary source file:

```text
src/smooth-user-follow.js
```

Build output:

```text
dist/smooth-user-follow.user.js
```
