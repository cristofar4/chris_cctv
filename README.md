# Sentra Security Systems: website

A luxury, cinematic marketing site for a CCTV, access-control and alarm installer. Plain HTML, CSS and JavaScript, with no build step and no install. Open `index.html`, or serve the folder:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

## What's on the page

### Hero: a live 3D security feed
The hero is a real-time WebGL scene: a modern villa at night, seen through a PTZ camera on the boundary wall.

- **People walk in, and the camera works.** A courier comes through the east gate, crosses the driveway past the parked car, puts a parcel down and rings the bell. A resident arrives, is face-matched, picks the parcel up and is let in by the access-control door, which swings open. The two stories loop.
- **AI overlays:** detection boxes with ID and confidence, a movement trail, an entrance zone that turns amber for unknown visitors and green for residents, a known-vehicle tag and package detection.
- **PTZ auto-tracking:** the camera pans, tilts and auto-zooms to keep the subject framed, with live PAN, TILT and ZOOM readouts.
- **Control-room chrome:** a live event log, a minimap of the site with the camera's field of view and the subject's path, and a phone-style notification when someone rings.
- **Three sensor modes:** *Night colour*, *Infrared* (grayscale with an IR illuminator, foliage glowing as it does on real IR footage) and *Thermal* (ironbow palette; people glow hot).
- **Camera-feed look:** bloom, lens distortion, chromatic aberration, grain, scanlines and vignette, all done in a custom post-processing pass.

### Railcam navigation
A dome camera rides a rail along the top of the nav. It runs on spring physics, watches the pointer, lights the link it looks at, locks focus on hover and drops a live preview monitor. When you scroll, the nav shrinks to a pill with a **DVR scrub bar**, and every nav jump is a camera cut through a full-screen **iris shutter**. On phones, the menu button is a working aperture.

### The rest
| Section | What it does |
| --- | --- |
| Preloader | A lens iris opens on the live feed as the "system check" counts to 100. |
| Statement | Huge editorial type that lights up word by word as you scroll, with inline image pills. |
| Capabilities | Massive count-up figures. |
| Systems | A pinned **horizontal showcase** of four massive cards, each with a live demo: a 4-camera NVR wall, a fingerprint reader cycling through granted and denied entries, an alarm floor plan that checks the camera before raising the alarm (*"it's the cat"*), and a system-health dashboard. |
| Night vision | Full-width drag-to-compare slider: a standard camera against Sentra night colour. |
| Selected work | Asymmetric ivory gallery with parallax and a CCTV overlay on hover. |
| Process | Sticky giant counter that rolls 01 → 04 as each step scrolls past, including an animated camera-coverage blueprint. |
| App | A 3D-tilting phone showing a live feed and incoming alerts. |
| Coverage | Giant scroll-reactive marquees. |
| Site survey | Large-type form with pill selectors, a live map label, a WhatsApp hand-off and an FAQ. |
| Footer | A full-width SENTRA wordmark that rises into place. |

Plus: smooth scrolling (Lenis), a cursor follower with contextual labels ("View", "Drag"), magnetic buttons and film grain.

## Performance and accessibility
- **Adaptive quality:** the 3D hero measures its own frame rate and steps down resolution, anti-aliasing and shadow quality. If a device can't hold a usable frame rate, it switches to a still photo with the event log still running. It also stops rendering whenever it is off screen or the tab is hidden.
- **Pause feed** button on the hero (motion longer than five seconds must be pausable).
- **`prefers-reduced-motion`:** the feed starts paused, smooth scrolling and camera cuts are switched off, and reveal animations are removed.
- Real links and buttons throughout, keyboard support (including tabbing through the horizontal showcase), visible focus, and an `aria-live` form status.

**Testing tip:** add `?webgl=force` to the URL to keep the 3D hero running on a machine without a GPU (for example, headless browsers).

## Files
```
index.html
assets/css/main.css        design system + every component
assets/js/shutter.js       iris geometry, shutter transitions, static noise, tweens
assets/js/scene.js         the 3D CCTV hero: property, people, story engine, AI overlay, PTZ camera, post FX
assets/js/hero-ui.js       event log, minimap, notifications, sensor modes, pause
assets/js/railcam.js       Railcam nav, live preview, scroll spy, DVR bar, camera cuts, mobile menu
assets/js/site.js          preloader, smooth scroll, reveals, showcase + demos, compare, parallax, form, FAQ
assets/vendor/             three.js r149 and Lenis 1.1.13 (MIT, see LICENSES.txt), bundled so the site works offline
assets/img/                photography
```

## Before going live
- **Form:** submissions are validated and confirmed on the page but not sent anywhere yet. Point the `submit` handler in `assets/js/site.js` at your backend or a form service (Formspree, Netlify Forms and so on).
- **WhatsApp:** set `WHATSAPP_NUMBER` at the top of `assets/js/site.js` (international format, digits only, e.g. `2348012345678`). The link pre-fills a message from whatever the visitor has entered.
- **Placeholder content to replace with real facts:**
  - the capability figures (4K, 24/7, 360°, AI)
  - the uptime and service details in the care card
  - the project names and camera counts in *Selected work*
  - the hours in the footer
- **Photos:** from [Unsplash](https://unsplash.com) (Unsplash License). Swap in photos of your own installations when you have them.

## Photo credits (Unsplash)
| File | Unsplash photo ID |
| --- | --- |
| hero-home.jpg | photo-1600585154340-be6161a56a0c |
| hero-business.jpg | photo-1486406146926-c627a92ad1ab |
| hero-estate.jpg | photo-1613490493576-7fde63acd811 |
| dome-lens.jpg | photo-1520697830682-bbb6e85e2b0b |
| cctv-wall.jpg | photo-1557597774-9d273605dfa9 |
| access-control.jpg | photo-1558002038-1055907df827 |
| work-residence.jpg | photo-1600047509807-ba8f99d2cdde |
| work-handover.jpg | photo-1621905251189-08b45d6a269e |
| survey-plans.jpg | photo-1503387762-592deb58ef4e |
