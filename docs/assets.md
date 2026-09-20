# 首页插画

- 使用方式：内置 ImageGen 图像编辑，未使用 CLI/API 生成。工具未提供模型版本选择或核验，因此不标注为特定型号。
- 项目素材：`public/images/summer-sky.webp`，1536 × 1024，约 197 KiB。由生成的 PNG 使用 `cwebp -q 86` 转换为 WebP。
- 背景参考：原有主图中的蓝天、白云、海浪与海岸。人物参考：用户提供的 `GYAY8dyb0AEfa-w.jpeg`。
- 先按参考图替换人物，再单独水平镜像人物，使其面向左侧；背景保持原方向，人物位于画面右侧，左侧留给页面文字。
- 首页及个人头像共享同一 WebP。头像以原图约 `x: 928–1312, y: 20–404` 的正方形区域裁切，保留面部、发饰与蓝色蝴蝶结；CSS 使用相对尺寸，随桌面及手机头像大小等比缩放。
- 生成图片只包含画面，标题、按钮和文字均为可访问的 HTML。

## 人物替换提示词

```text
Use case: compositing
Asset type: replacement hero illustration for an existing personal website, 1536 × 1024 landscape, same 3:2 canvas as image 1.
Input images: Image 1 is the EDIT TARGET and authoritative background/composition reference: the existing blue seaside website hero. Image 2 is the CHARACTER REFERENCE: use this exact illustrated character design, hairstyle, accessories, face, clothing and delicate drawing style.
Primary request: Edit image 1 by replacing its woman with the character from image 2. Preserve the existing seaside background as closely as possible: the open blue sky, distinctive towering white cumulus cloud formations, birds, low distant mountain horizon, luminous turquoise ocean and white surf, and the small white coastal buildings on the far-right cliff. Keep scenery outside the replaced character's silhouette unchanged wherever possible. Do not replace the background with the white background of image 2.
Subject: Faithfully recreate the character in image 2: long silver-white and very pale lavender wavy hair, braided half-up hairstyle, large blue ribbon at the back, pastel yellow/pink/cyan star-shaped hair ornaments, blue-violet eye, softly upward-looking right-facing profile, delicate pastel pink and cool blue linework. White and pale icy-blue tiered dress with scalloped lace edges, lace shoulder capelet and cuffs, and blue ribbon accents. Preserve the reference character's gentle expression and recognizable silhouette. Hands held naturally together in front, as in the reference. Remove the old character and straw hat entirely.
Composition: Match image 1's website layout. One character only, occupying the right third to right 45% of the image. Full head visible near x=75%, y=20%, with clear sky above the hair; frame from head to around mid-thigh. Keep her face recognizable and unobstructed, and keep enough space to the right of her gaze. Flowing long curls and dress remain in the right half. The left half stays open sky and sea for live HTML headings; no character, prominent stars, or new foreground objects in that text area.
Lighting/style: Integrate the reference character naturally into the existing bright seaside daylight, retaining the reference's luminous pastel anime illustration and fine linework. Soft blue and lavender shading, natural scale and perspective, refined crisp detail. Retain colored star hair clips, without scattering extra decorative stars across the sky.
Constraints: Replace only the character while preserving the background, horizon, overall color balance and 3:2 composition. Fully clothed character, natural anatomy and hands. No typography, UI, logos, watermark, border, collage, white cutout outline, or second character.
```

## 人物朝左的编辑提示词

```text
Use case: precise-object-edit
Edit the provided generated seaside hero illustration. Make exactly one targeted change: HORIZONTALLY MIRROR ONLY THE CHARACTER, including her entire hairstyle, star hair clips, blue ribbons, lace clothing, arms and hands, so that her profile faces LEFT, toward the open sky and the website's text area.
Keep the mirrored character in the same right-hand portion of the composition, at the same scale and vertical position. Mirror the figure around the vertical centerline of her own bounding box, not around the center of the canvas. Her nose and gaze must clearly point left. Preserve her exact recognizable face, silver-lavender curls, braid, star accessories, white/icy-blue lace dress, fine pastel linework, colors, expression and pose, with only the left/right reflection changed.
CRITICAL INVARIANTS: Do not mirror or alter the background or the entire canvas. Keep the original blue sky, cloud formations, birds, mountains, ocean, waves, horizon, and far-right coastal buildings in their original positions. Keep the left half free of the character so the website text has room. Naturally restore background only in areas uncovered by mirroring the figure.
Same 1536 × 1024 landscape canvas. One character only. No other changes, no new objects, no text, logo, border, or watermark.
```

## 原版插画记录

文章示例中的 `content/blog/assets/summer-sky.webp` 保留原版插画。以下为原版生成记录。

- 使用方式：内置 ImageGen 工具，单张原创生成，未使用 CLI。
- 项目素材：`public/images/summer-sky.webp`。
- 原图：1536 × 1024 PNG；使用 `cwebp -q 86` 转换为 WebP，供首页及头像使用。
- 风格：蓝白色调、夏日海边、银蓝色头发的原创成年动漫角色。
- 生成图片只包含画面，标题、按钮和文字均为可访问的 HTML。

### 原版完整生成提示词

```text
Use case: stylized-concept
Asset type: original panoramic background illustration for a blue and white anime-inspired personal website, landscape aspect ratio approximately 3:2.
Primary request: A beautiful serene Japanese anime illustration of a young adult woman with long silvery pale-blue hair and blue eyes, wearing an elegant white summer blouse with a blue ribbon, standing at a bright blue seaside under magnificent towering white cumulus clouds. Her hair is blowing gently in the sea breeze, she holds a simple pale straw summer hat at her side and turns back toward the viewer with a subtle smile.
Composition: website hero uses live text in its LEFT half. Keep the left 50 percent mostly softly lit pale sky and distant ocean with very little detail; place the woman in the right third of the landscape, head near the upper-right, framed from mid-thigh upward, full head visible. Make the figure large enough to recognize facial features, with space above her head. Horizon low in the frame, wide atmospheric sky.
Style: exquisitely drawn contemporary anime key visual, delicate clean lines, painterly clouds, luminous soft daylight, crisp but gentle blue-white aesthetic. Restrained navy linework, cyan and cerulean blue accents, almost entirely white and blue, very small soft sea-green details.
Mood: peaceful summer, youthful curiosity, airy and uplifting, refined rather than overly cute.
Constraints: one original adult character only, natural anatomy and hands, no text, no typography, no logo, no watermark, no UI, no borders, no photographic elements.
```

图标及研究方向小图为项目内原创 SVG/CSS，无需外部图标包。
