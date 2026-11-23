# Sentra Security Systems: website

A static, dependency-free marketing site for a CCTV, access-control and alarm installer. Open `index.html` in a browser, or serve the folder with any static host.

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

## The Railcam navigation

The nav works like a piece of security hardware:

| Behaviour | What happens |
| --- | --- |
| **Ceiling rail** | A PTZ dome camera hangs from a rail along the top edge of the nav and rides it on a spring. It overshoots, settles, and its head swings like a pendulum when it brakes. |
| **Watching you** | The lens follows your pointer anywhere on the page. |
| **Light cone** | The camera casts a beam. Only the part of the menu inside the beam is lit, so labels light up as the beam passes over them. |
| **Focus lock** | Hover a link and the camera drives over, then corner brackets snap round the label. |
| **Live preview** | A small CCTV monitor drops from the camera with a feed of that section: channel number, REC light and a running timecode. Moving between links switches channel through a burst of static. |
| **Guard tour** | With nothing hovered, the camera patrols the links. Once you scroll into a section it parks over that section's link. |
| **DVR scrub bar** | When the nav shrinks to a floating pill, a recording timeline shows where you are on the page, with a mark for each section. Drag it to scrub through the page like footage. |
| **Camera cuts** | Nav links don't scroll. A full-screen six-blade iris closes, shows the channel name, then opens on the new section. |
| **Mobile iris** | The menu button is a working aperture. It opens the menu through the same shutter, and the menu is laid out as camera channels. |
| **IR mode** | The eye button switches the page to green night-vision. |

Other details: the hero boots like a feed coming online (static, then a focus pull), Home / Business / Estate switch the hero like changing channels, and a motion-detection box follows the pointer across the hero.

Everything respects `prefers-reduced-motion`: cuts become instant jumps, the camera stops patrolling and physics are switched off.

## Files

```
index.html
assets/css/main.css      design tokens, layout, all component styles
assets/js/shutter.js     iris geometry + shutter transition, static noise, tween helpers
assets/js/railcam.js     Railcam nav, live preview, scroll spy, DVR bar, camera cuts, mobile menu
assets/js/hero.js        hero frame path, boot sequence, channel tabs, parallax + motion tracker
assets/js/site.js        reveals, tilt cards, approach timeline, form, FAQ, IR mode, clocks
assets/img/              photography
```

## Before going live

- **Form:** submissions are validated and confirmed on the page but not sent anywhere yet. Point the `submit` handler in `assets/js/site.js` at your backend or a form service (Formspree, Netlify Forms, etc.).
- **WhatsApp:** set `WHATSAPP_NUMBER` at the top of `assets/js/site.js` (international format, digits only, e.g. `2348012345678`). The link pre-fills a message from whatever the visitor has typed into the form.
- **Photos:** the images are from [Unsplash](https://unsplash.com) (Unsplash License). Swap in photos of your own installations when you have them. Keep the same filenames, or update the `src` and `data-feed-img` attributes.

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
