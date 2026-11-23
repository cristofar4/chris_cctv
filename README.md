# Sentra: city-scale video intelligence

A luxury, interactive website concept for a street-camera and city video-analytics brand. Plain HTML, CSS and JavaScript: no build step, no frameworks, real photography throughout.

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

## The experience, top to bottom

| Section | What the visitor can do |
| --- | --- |
| **Railcam navigation** | A camera rides a rail along the top of the nav, follows the pointer, lights the link it looks at and drops a live preview of each section. Every jump is a camera cut through an iris shutter, and the scrolled nav carries a draggable recording timeline. |
| **Hero: Analysis Lens** | A real night photograph of Shibuya Crossing. Move anywhere and a lens magnifies the street 1.9× and shows what the AI sees: taxis, the bus, pedestrians and plates lock on with detection boxes, and the counters add up what has been scanned. Switch the lens to **Thermal** or **Night IR**, both computed from the photo itself. With no pointer, the lens tours the street on its own. |
| **Sentra Command** | A working operations console. Nine real city cameras on a video wall, alerts ranked by priority, a city map, 1 / 4 / 9 layouts, **plain-language search** across every camera (try "red coat", "bus", "stopped") and alert actions. It tours itself until the visitor takes over. |
| **Cameras** | A pinned, horizontally scrolling product line, each card with a hands-on demo: **Vanta PTZ** (drag to pan, scroll to zoom, presets) over a real motorway interchange; **Aperture 180** (a draggable panorama with sensor seams); **Lumen ANPR** (plate read); **Ember Thermal** (drag between visible and thermal views of a real night street). |
| **Solutions** | Four full-height photographic panels (roads, public spaces, night districts, rail and infrastructure) that open on hover or tap. |
| **Engineering** | A real PTZ camera with hotspots on its optics, housing, pan and tilt, power and mount, plus environmental ratings. |
| **Architecture** | A four-stage pipeline (capture, edge AI, secure platform, command) with data packets travelling between stages. |
| **Deployment** | A sticky counter that rolls 01 → 04 through assess, design, pilot, and scale and operate. |
| **Statement, contact, footer** | Earth-at-night statement, a large-type briefing form, FAQ and a full-width wordmark. |

Throughout: Lenis smooth scrolling, a preloader iris, magnetic buttons, a contextual cursor follower, reveals and film grain.

## Contact details: one file
Edit **`assets/js/config.js`**:

```js
window.SENTRA_CONFIG = {
  email: '',      // e.g. 'cities@yourcompany.com'. The form opens an email with the request written out
  whatsapp: ''    // optional, digits only, e.g. '2348012345678'
};
```

With an email set, the form opens the visitor's email app with the request ready to send. Without one, it opens WhatsApp instead.

## Placeholder content to swap for the client's own
This is a pitch-ready concept for a fictional brand, so replace the following with real company information before launch:

- the **brand** (Sentra)
- the **product names and specifications** (Vanta PTZ, Aperture 180, Lumen ANPR, Ember Thermal, and their zoom, resolution and ratings)
- the platform name (Sentra Command)
- the engineering ratings
- the FAQ answers

No customers, deployments or performance results are claimed. Interactive views are labelled as demos where it matters: the hero lens says "still-frame analysis · demo", the plate read says "illustrative", and the thermal compare says "simulated".

## Performance and accessibility
- No WebGL and no heavy libraries: the hero lens is a 2D canvas, and the thermal, IR and edge views are computed once from the photo when the page loads. Animation loops stop when off screen or when the tab is hidden.
- Images load lazily below the fold, and the hero photo is preloaded.
- `prefers-reduced-motion` turns off smooth scrolling, tours, camera cuts and reveal motion.
- Real buttons and links throughout, keyboard-reachable demos (including tabbing through the horizontal showcase), and visible focus.

## Files
```
index.html
assets/css/main.css      design system + every section
assets/js/config.js      contact details
assets/js/shutter.js     iris geometry, shutter transitions, static noise, tweens
assets/js/lens.js        hero Analysis Lens: annotations, sensor views, tour
assets/js/railcam.js     Railcam nav, live preview, scroll spy, DVR bar, camera cuts, mobile menu
assets/js/command.js     Sentra Command console
assets/js/products.js    PTZ, panorama, ANPR and thermal demos
assets/js/site.js        preloader, smooth scroll, showcase, panels, hotspots, pipeline, form, FAQ
assets/vendor/           Lenis 1.1.13 (MIT)
assets/img/              photography
```

## Photo credits
All photographs are from [Unsplash](https://unsplash.com) (Unsplash License).

| File | Unsplash photo ID |
| --- | --- |
| city-shibuya.jpg | photo-1542051841857-5f90071e7989 |
| city-crossing.jpg | photo-1540959733332-eab4deabeeaf |
| city-chinatown.jpg | photo-1508009603885-50cf7c579365 |
| city-crowd.jpg | photo-1517732306149-e8f829eb588a |
| city-interchange.jpg | photo-1465447142348-e9952c393450 |
| city-trails.jpg | photo-1473042904451-00171c69419d |
| city-night-street.jpg | photo-1519501025264-65ba15a82390 |
| city-avenue.jpg | photo-1449824913935-59a10b8d2000 |
| city-times.jpg | photo-1496442226666-8d4d0e62e6e9 |
| city-neon.jpg | photo-1519608487953-e999c86e7455 |
| city-lights.jpg | photo-1444723121867-7a241cacace9 |
| car-night.jpg | photo-1609521263047-f8f205293f24 |
| earth-night.jpg | photo-1451187580459-43490279c0fa |
| ptz-pole.jpg | photo-1528312635006-8ea0bc49ec63 |
| cam-bullet.jpg | photo-1565591452825-67d6b7df1d47 |
| chip.jpg | photo-1550751827-4bd374c3f58b |
| datacenter.jpg | photo-1573164713988-8665fc963095 |
| freight.jpg | photo-1474487548417-781cb71495f3 |
| work-handover.jpg | photo-1621905251189-08b45d6a269e |
