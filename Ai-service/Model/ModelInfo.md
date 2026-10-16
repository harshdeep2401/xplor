# XPLOR floor-plan segmenter: MiT-B3 + U-Net

Model card and run guide for the trained model from experiment `03_unet_mitb3` (XPLOR capstone, Part 4 Stage B: wall and room segmentation). The model takes a floor-plan image, either a clean scan or a phone photo, and labels every pixel as background, wall, door, window or room.

---

## 1. What you need

### Files
| File | Size | Purpose |
|---|---|---|
| `best.pt` | 189,661,959 bytes (~190 MB) | Trained weights (epoch 28 of 30). Plain PyTorch `state_dict`, float32. |
| `predict.py` | small | Standalone loader and inference script. Does not need `xplor.py` or the dataset. |

Source on the training machine: `C:\TrainXPLOR\experiments\03_unet_mitb3\ckpt\best.pt` and `...\03_unet_mitb3\predict.py`.

Checksums of `best.pt`, to confirm the copy is intact:
- MD5 `352FA38105C4F9F978DE5AD9CB6C9A06`
- SHA-256 `C0482029216C3F1DB7ED334CE01BF82B559373041121F165E1AA570A4F6EB5D9`

On Windows, check with `Get-FileHash best.pt -Algorithm MD5`; on Linux or macOS, with `md5sum best.pt`.

Do **not** use `last.pt` (570 MB). It is the full training checkpoint, including optimizer and scheduler state, and is only needed to resume training.

### Python packages
| Package | Version tested | Notes |
|---|---|---|
| Python | 3.12 | 3.10 or newer should work. |
| `torch` | 2.14.1+cu126 | Any recent version. Use a CUDA build for a GPU. **Pascal GPUs (GTX 10xx, P-series) need a cu126 or older build**, because newer CUDA builds dropped Pascal. |
| `segmentation-models-pytorch` | **0.5.0** | Pin this version; it defines the architecture and the weight names. |
| `timm` | 1.0.30 | Installed automatically with smp. |
| `opencv-python-headless` | 5.0.0 | Use `opencv-python` instead if you need GUI windows. |
| `numpy` | 2.5.2 | |

Install (GPU, CUDA 12.6 build):
```
pip install torch --index-url https://download.pytorch.org/whl/cu126
pip install segmentation-models-pytorch==0.5.0 opencv-python-headless numpy
```
No internet download happens at load time: `encoder_weights=None` builds an empty network, and `best.pt` fills in every weight.

### Hardware
- **GPU (recommended):** any CUDA GPU. Inference is one 512×512 forward pass in float16 autocast. Measured on a Quadro P6000: **~81 ms per image** including pre- and post-processing, and **~0.4 GB peak GPU memory**.
- **CPU:** works (autocast is turned off automatically) but is slower. This path has not been tested on the training machine.

---

## 2. How to run it

### Command line
```
python predict.py best.pt plan.jpg out
```
Outputs:
- `out_mask.png`: grayscale PNG, one class id (0–4) per pixel, same size as the input image.
- `out_color.png`: the input blended 50/50 with the class colours.
- The console prints the share of pixels in each class.

If you leave out the third argument, the outputs are named after the input file (`plan_mask.png`, `plan_color.png`).

### From your own code
```python
import cv2
from predict import load_model, predict, CLASSES, PAL

model = load_model('best.pt')          # load once; uses CUDA if available
img = cv2.imread('plan.jpg')           # BGR uint8, any size and aspect ratio
mask = predict(model, img)             # HxW uint8 numpy array, values 0..4, same HxW as img

walls = (mask == 1)                    # boolean mask for one class
```
`predict()` handles resizing, padding, normalisation and mapping back to the original size. Call `load_model` once and reuse the model.

### Loading without predict.py
If you embed the model in another codebase, this is the whole requirement:
```python
import torch, segmentation_models_pytorch as smp

class Norm(torch.nn.Module):                      # must keep this name structure: keys are 'm', 's', 'net.*'
    def __init__(self, net):
        super().__init__()
        self.net = net
        self.register_buffer('m', torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1))
        self.register_buffer('s', torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1))
    def forward(self, x):                          # x: Bx3xHxW, RGB, float in [0, 1]
        return self.net((x - self.m) / self.s)

model = Norm(smp.Unet('mit_b3', encoder_weights=None, classes=5))
model.load_state_dict(torch.load('best.pt', map_location='cpu', weights_only=True))
model.eval()
```
Then preprocess the image as described in section 3.

---

## 3. Input and output specification

### Input (what the network expects)
1. **Colour order:** RGB. OpenCV loads BGR, so reverse the channels (`img[..., ::-1]`).
2. **Letterbox to 512×512:**
   - Scale so the longest side is 512, keeping the aspect ratio. Use `cv2.INTER_AREA`.
   - Paste the result centred on a **white** (255) 512×512 canvas.
3. **Scale:** convert to float and divide by 255, giving values in [0, 1].
4. **Normalisation:** done **inside** the model (ImageNet mean 0.485/0.456/0.406, std 0.229/0.224/0.225). Do not normalise again.
5. **Tensor shape:** `B×3×512×512`, float32. Batching works.

Other input sizes run because the network is fully convolutional, and sides must be multiples of 32. However, the model was trained and scored only at 512, so other sizes are untested.

### Output
- Logits `B×5×512×512`. Take `argmax(dim=1)` to get class ids; take `softmax(dim=1)` for per-class confidence.
- `predict()` crops off the white padding and resizes the result back to the original image size with nearest-neighbour interpolation.

### Classes
| Id | Class | Overlay colour (RGB) | Share of pixels in validation data |
|---|---|---|---|
| 0 | background | white (255, 255, 255) | 44.5% |
| 1 | wall | red (220, 40, 40) | 6.4% |
| 2 | door | green (40, 180, 60) | 0.6% |
| 3 | window | blue (40, 90, 230) | 1.4% |
| 4 | room | yellow (250, 220, 60) | 47.1% |

"Room" means floor area inside the building (all room types merged). "Background" is everything outside the building, plus text and margins.

---

## 4. Model details

| Item | Value |
|---|---|
| Architecture | U-Net decoder on a MiT-B3 encoder (the SegFormer "Mix Transformer"), built with `smp.Unet('mit_b3', classes=5)` |
| Parameters | 47.4 M |
| Encoder start point | ImageNet-pretrained MiT-B3 (smp `imagenet` weights) |
| Weight format | `state_dict` (OrderedDict, 636 entries, float32): `m`, `s`, then `net.encoder.*`, `net.decoder.*`, `net.segmentation_head.*` |
| Training input size | 512×512 letterbox, white padding |

### Training summary
- **Data:** CubiCasa5k, official split: 4,200 train, 400 validation and 400 test plans. SVG annotations were rasterised to 5-class masks, and crops are at most 1024 px.
- **Augmentation:** with probability 0.9, a simulated phone photo: random perspective and rotation, uneven lighting, shadows, blur, noise and JPEG artefacts. This makes the model robust to photos, not only clean scans.
- **Loss:** cross-entropy with square-root inverse-frequency class weights, plus Tversky loss (α 0.3, β 0.7). Tversky pushes recall on thin, rare classes.
- **Optimiser and schedule:**
  - AdamW: learning rate 4e-4 for the decoder and 1e-4 for the encoder, weight decay 1e-4.
  - Batch size 12, mixed precision.
  - 1-epoch warmup, then cosine decay.
- **Length:** 30 epochs, 3 h 57 min on a Quadro P6000. The best validation checkpoint was epoch 28.
- **Model selection:** the epoch with the best validation mean F1 on simulated photos.

Full method write-up: `experiments/03_unet_mitb3/TRAINING_DETAILS.md`.

---

## 5. Performance (test set, 400 plans)

Two conditions:
- **Clean:** the original plan images.
- **Photo:** the same plans passed through the camera simulation with a fixed seed (123), so every model sees identical distortions.

| | mean F1 (5 classes) | mean IoU | mean F1 (4 foreground classes) |
|---|---|---|---|
| Clean | **0.902** | 0.828 | 0.881 |
| Photo | **0.873** | 0.787 | 0.844 |

Photo F1 per class: wall **0.846**, door **0.741**, window **0.822**, room **0.966**.

### Comparison with the other models tried
| Model | Params | Photo mF1 | Clean mF1 |
|---|---|---|---|
| **MiT-B3 + U-Net (this model)** | 47.4 M | **0.873** | **0.902** |
| U-Net ResNet-34 | 24.4 M | 0.855 | 0.889 |
| DeepLabV3+ ResNet-50 † | 26.7 M | 0.853 | 0.885 |

† Scored on Colab with a slightly different protocol. The project plan's reference benchmark is mean F1 0.86 on clean data.

---

## 6. Limitations

- **Pixel labels only.** The model does not split rooms into separate instances, give room types, or produce vector walls and openings. For 3D/VR you need post-processing, for example:
  - connected components on the room mask to get individual rooms;
  - contour or line fitting on the wall mask;
  - snapping doors and windows to walls.
- **Doors and windows are the weakest classes** (F1 0.74 and 0.82 on photos). They are small and thin, and at 512 px a very large plan can shrink them to a few pixels. For big or detailed plans, consider tiling the image or cropping to the building first.
- **Photo robustness has been measured on simulated photos only.** Real phone photos have not yet been scored. Expect lower accuracy on strong glare, folded paper, heavy perspective, or hand-drawn plans.
- **Domain:** CubiCasa5k contains Finnish residential plans. Plans from other countries, architectural styles, or CAD conventions may need fine-tuning.
- **Licence:** CubiCasa5k is believed to be released under CC BY-NC 4.0 (non-commercial). Treat this model as non-commercial unless you verify otherwise.

---

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Missing key(s): "m", "s"` or `Unexpected key(s): "net.…"` | You built a bare `smp.Unet` without the `Norm` wrapper. Wrap it as in section 2. |
| `Unexpected key(s)` or size mismatch inside `net.encoder` | Wrong smp version or wrong encoder name. Use `segmentation-models-pytorch==0.5.0` and `'mit_b3'`. |
| Output is mostly one class or noise | Usually preprocessing: BGR passed instead of RGB, values 0–255 instead of 0–1, normalised twice, or black padding instead of white. |
| `no kernel image is available for execution on the device` | Your torch build does not support your GPU. On Pascal, install the cu126 build. |
| Ground-truth masks from the dataset look like colours, not ids | `mask_c.png` files are palette PNGs. Read them with `numpy.array(PIL.Image.open(path))`, not `cv2.imread`. |
| Slow on CPU | Expected. Use a CUDA GPU, or reduce the number of images per call. |

---

## 8. Verification

On 2026-10-16, `predict.py` was checked against the training code (`xplor.load_weights('03_unet_mitb3')`):
- All weights are identical.
- On test plan `colorful_11260` (1024×704, scored at full size), pixel accuracy was 95.2%.
- Per-class F1 on that plan: background .96, wall .80, door .78, window .74, room .98.
