# Sentra Security Systems: website

A luxury, cinematic site for an Abuja-based CCTV, access-control and alarm installer. Plain HTML, CSS and JavaScript, with no build step and no install. Open `index.html`, or serve the folder:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Your details: one file
Everything business-specific lives in **`assets/js/config.js`**:

```js
window.SENTRA_CONFIG = {
  whatsapp: '',               // e.g. '2348012345678'. International format, digits only
  city: 'Abuja',
  country: 'Nigeria',
  countryCode: 'ng',          // limits map searches to this country
  mapCenter: [9.0765, 7.4986],
  mapZoom: 12
};
```

Add your WhatsApp number and every WhatsApp link on the site goes to you, including the survey form. Until then, WhatsApp asks the visitor which chat to send the message to.

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
| Philosophy | A camera viewfinder stays pinned while three rules scroll past. On each rule it switches preset, hunts for focus, then locks with the reticle snapping green and the focus distance rolling. |
| At a glance | Massive count-up figures that are true by definition: 4 services, 3 property types, 24/7 recording, 1 team. |
| Systems | A pinned **horizontal showcase** of four massive cards, each with a live demo: a 4-camera NVR wall, a fingerprint reader cycling through granted and denied entries, an alarm floor plan that checks the camera before raising the alarm (*"it's the cat"*), and a system-health dashboard. |
| Night vision | Full-width drag-to-compare slider: a standard camera against Sentra night colour. |
| Who we protect | Asymmetric ivory gallery of property types (homes, estates, businesses, installation) with parallax and a CCTV overlay on hover. |
| Process | Sticky giant counter that rolls 01 → 04 as each step scrolls past, including an animated camera-coverage blueprint. |
| App | A 3D-tilting phone showing a live feed and incoming alerts. |
| Coverage | Giant scroll-reactive marquees. |
| Site survey | Large-type form with pill selectors. **Submitting opens WhatsApp with the whole request written out**, ready to send. Includes a **real map** of Abuja (OpenStreetMap): type an area and press Enter (or leave the field), and the pin flies there. Ends with an FAQ. |
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
assets/js/config.js        your business details (WhatsApp number, city, map centre)
assets/js/shutter.js       iris geometry, shutter transitions, static noise, tweens
assets/js/scene.js         the 3D CCTV hero: property, people, story engine, AI overlay, PTZ camera, post FX
assets/js/hero-ui.js       event log, minimap, notifications, sensor modes, pause
assets/js/railcam.js       Railcam nav, live preview, scroll spy, DVR bar, camera cuts, mobile menu
assets/js/site.js          preloader, smooth scroll, philosophy viewfinder, showcase + demos, compare, parallax, map, form, FAQ
assets/vendor/             three.js r149, Lenis 1.1.13 and Leaflet 1.9.4 (see LICENSES.txt), bundled locally
assets/img/                photography
```

## What is real, and what is illustrative
The copy makes no invented claims: no project counts, uptime figures, prices, opening hours or "free" offers. Wherever something is a demonstration, the page says so:

- The 3D hero is labelled a **simulated demo**.
- The camera wall and the health dashboard in *Systems* are labelled **example** views.
- The night-vision slider is labelled **simulated**.
- *Who we protect* describes **property types**, not past projects.
- The photos are stock images from [Unsplash](https://unsplash.com) (Unsplash License). Swap in photos of your own installations when you can, and if you want a real portfolio, send the project details and the gallery can carry them.

## Map and search
- Map tiles come from OpenStreetMap and area search from OpenStreetMap's Nominatim service. Both are free and need no key.
- Search runs only when the visitor finishes typing (on Enter or when they leave the field), never per keystroke, as Nominatim's [usage policy](https://operations.osmfoundation.org/policies/nominatim/) requires. Attribution is shown on the map.
- If the site gets heavy traffic, switch to a commercial tile provider in `assets/js/site.js` (search for `tileLayer`).
- **Privacy:** the area a visitor types is sent to Nominatim to find it on the map. Nothing else leaves the page until the visitor chooses to send the WhatsApp message.

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
