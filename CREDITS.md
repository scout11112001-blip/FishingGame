# Источники и лицензии

Всё стороннее, что входит в игру, — откуда взято и на каких условиях. Добавляешь файл — добавь строку.

## Звуки

Исходники — в `art/audio`, готовые файлы делает `npm run audio` (скрипт `scripts/audio.ts`).

| Файл в игре | Исходник | Откуда | Лицензия |
|---|---|---|---|
| `public/audio/splash.wav` | `mixkit-fish-jumping-in-water-2922.wav` | [Mixkit](https://mixkit.co/free-sound-effects/), «Fish jumping in water», № 2922 | [Mixkit Sound Effects Free License](https://mixkit.co/license/#sfxFree): бесплатно, в том числе в коммерческих проектах, без указания автора |
| `public/audio/ambient-river.wav` | `mixkit-crickets-near-the-river-2459.wav` | [Mixkit](https://mixkit.co/free-sound-effects/), «Crickets near the river», № 2459 | [Mixkit Sound Effects Free License](https://mixkit.co/license/#sfxFree) |
| `public/audio/catch.wav` | `867458__qubodup__waboba-moon-ball-water-splash-3.flac` | [Freesound](https://freesound.org/s/867458/), qubodup, «Waboba Moon Ball Water Splash 3» | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) — общественное достояние, можно всё, указывать автора не нужно |

Исходник сверчков весит 46 МБ и в репозиторий не кладётся (см. `.gitignore`) — чтобы пересобрать фон, скачай его с Mixkit заново в `art/audio`.

## Картинки

Фоны водоёмов, поплавок, удочки, рыбы и значок серебра сгенерированы нейросетью (Gemini) по нашим промптам и обработаны скриптом `npm run art`. Требования Яндекс Игр разрешают заранее сгенерированные материалы (п. 1.23).
