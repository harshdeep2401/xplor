# Demo steps

## 1. Open Docker Desktop

Wait until it says "Engine running".

## 2. Terminal 1: start the AI and the tunnel

```
cd C:\xplor\Ai-service
docker compose -f compose.host.yml up -d
.\scripts\tunnel-url.ps1 -UpdateServerEnv
```

## 3. Terminal 2: start the server

```
cd C:\xplor\server
npm run dev
```

## 4. Terminal 3: start the website

```
cd C:\xplor\client
npm run dev
```

## 5. Terminal 4: watch the GPU

```
nvidia-smi -l 1
```

## 6. Terminal 1: watch the AI log

```
docker compose -f compose.host.yml logs -f ai-service
```

## 7. Browser

1. Open `http://localhost:5173`
2. Log in with email and password.
3. Click **System status**. All green, route **Cloudflare tunnel**, device **Quadro P6000**.

## 8. Show the model file is the one on this PC

In Terminal 4, press Ctrl+C, then:

```
certutil -hashfile C:\xplor\Ai-service\Model\best.pt SHA256
```

The first 12 characters match **Weights fingerprint** on the System status page. Then:

```
nvidia-smi -l 1
```

## 9. Import a floor plan

1. Click **← Dashboard**.
2. Click **Import Floor Plan**, enter a name, pick an image, and import.
3. Show the detected plan in the 2D editor.
4. Click **Convert to 3D** and show the 3D view.
5. Go back to **System status**. The import is listed under **Recent AI calls**.

## 10. Switch the AI off and on

In Terminal 1, press Ctrl+C, then:

```
docker compose -f compose.host.yml stop ai-service
```

The System status page turns red. Then:

```
docker compose -f compose.host.yml start ai-service
```

Wait about 1 minute. The System status page turns green.

## 11. After recording

In Terminal 1:

```
.\scripts\tunnel-url.ps1 -Local
docker compose -f compose.host.yml down
```

In Terminals 2 and 3, press Ctrl+C.
