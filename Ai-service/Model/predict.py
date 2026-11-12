r"""Standalone inference for the XPLOR MiT-B3 + U-Net floor-plan segmenter (no xplor.py needed).

Needs: torch, segmentation-models-pytorch==0.5.0 (pulls timm), opencv-python-headless, numpy, and best.pt.
Usage:  python predict.py best.pt plan.jpg [out_prefix]
Writes  <out_prefix>_mask.png (class ids 0-4, original size) and <out_prefix>_color.png (overlay).
"""
import sys
import cv2
import numpy as np
import torch
import segmentation_models_pytorch as smp

CLASSES = ['background', 'wall', 'door', 'window', 'room']
PAL = np.array([[255, 255, 255], [220, 40, 40], [40, 180, 60], [40, 90, 230], [250, 220, 60]], np.uint8)  # RGB
SIZE = 512


class Norm(torch.nn.Module):
    """Same wrapper as training: input is RGB float in [0,1]; ImageNet normalisation happens inside."""
    def __init__(self, net):
        super().__init__()
        self.net = net
        self.register_buffer('m', torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1))
        self.register_buffer('s', torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1))

    def forward(self, x):
        return self.net((x - self.m) / self.s)


def load_model(path, device='cuda' if torch.cuda.is_available() else 'cpu'):
    model = Norm(smp.Unet('mit_b3', encoder_weights=None, classes=5))
    model.load_state_dict(torch.load(path, map_location=device, weights_only=True))
    return model.to(device).eval()


@torch.no_grad()
def predict(model, bgr):
    """bgr: HxWx3 uint8 image (as from cv2.imread). Returns HxW uint8 class ids at the original size."""
    h, w = bgr.shape[:2]
    s = SIZE / max(h, w)
    nh, nw = int(round(h * s)), int(round(w * s))
    y0, x0 = (SIZE - nh) // 2, (SIZE - nw) // 2
    canvas = np.full((SIZE, SIZE, 3), 255, np.uint8)  # letterbox on white, like training
    canvas[y0:y0 + nh, x0:x0 + nw] = cv2.resize(bgr, (nw, nh), interpolation=cv2.INTER_AREA)
    dev = next(model.parameters()).device
    x = torch.from_numpy(canvas[..., ::-1].copy()).permute(2, 0, 1).float()[None].to(dev) / 255  # RGB, [0,1]
    with torch.autocast(dev.type, dtype=torch.float16, enabled=dev.type == 'cuda'):
        logits = model(x)  # 1x5x512x512
    pred = logits.argmax(1)[0, y0:y0 + nh, x0:x0 + nw].byte().cpu().numpy()  # drop the padding
    return cv2.resize(pred, (w, h), interpolation=cv2.INTER_NEAREST)


if __name__ == '__main__':
    ckpt, img_path = sys.argv[1], sys.argv[2]
    out = sys.argv[3] if len(sys.argv) > 3 else img_path.rsplit('.', 1)[0]
    model = load_model(ckpt)
    img = cv2.imread(img_path)
    mask = predict(model, img)
    cv2.imwrite(out + '_mask.png', mask)
    overlay = (img * 0.5 + PAL[mask][..., ::-1] * 0.5).astype(np.uint8)
    cv2.imwrite(out + '_color.png', overlay)
    print('pixel share:', {c: round(float((mask == i).mean()), 3) for i, c in enumerate(CLASSES)})
