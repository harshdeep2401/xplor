# Hosting the AI service from the GPU PC

This guide is for running the floor-plan AI on **this Windows PC** (the one with the NVIDIA GPU) while
the XPLOR server runs somewhere else, e.g. a cloud host. No networking knowledge needed: follow the
steps in order.

## How it works

```
   CLOUD                                         THIS PC
┌───────────────────┐  HTTPS  ┌────────────┐  outbound  ┌─────────────────────────────┐
│ XPLOR server      │────────▶│ Cloudflare │◀───────────│ "tunnel" container          │
│ FASTAPI_WEBHOOK_  │         │            │   tunnel   │   (cloudflared)             │
│ URL = tunnel URL  │         └────────────┘            │        │                    │
│ FASTAPI_SECRET    │                                   │        ▼                    │
└───────────────────┘                                   │ "ai-service" container      │
                                                        │   model on the GPU          │
                                                        └─────────────────────────────┘
```

- The `tunnel` container opens a connection **out** from this PC to Cloudflare, and Cloudflare gives it a
  public `https://` address. You don't open any ports on your router or Windows firewall.
- When a user imports a floor plan, the server sends the image to that address. Cloudflare passes it down
  the tunnel to the `ai-service` container, which runs the model and sends the walls, doors, windows and
  rooms back.
- **Security:**
  - Every request must carry the shared secret (`FASTAPI_SECRET`), so nobody else can use your GPU, even
    if they find the address. Requests without it are refused before the image is even read.
  - The AI service has no port open on this PC or your network; the tunnel is the only way in.
  - The interactive API page (`/docs`) is turned off, uploads are size-limited, and the container runs as
    an unprivileged user with the model mounted read-only.
  - The only public pages without the secret are `/` and `/health`, which say whether the service is up.

## One-time setup

1. **Docker Desktop.** Install it if needed (<https://www.docker.com/products/docker-desktop/>), then in
   Docker Desktop → **Settings → General**, turn on **"Start Docker Desktop when you sign in to your
   computer"**. The containers restart by themselves once Docker is running.
2. **NVIDIA driver.** Keep it up to date (GeForce Experience / NVIDIA App, or nvidia.com). Docker Desktop
   uses it for the GPU automatically.
3. **Model weights.** Get `best.pt` from the project lead and put it at `Ai-service\Model\best.pt`.
4. **Shared secret.** In `Ai-service\.env` (copy `Ai-service\.env.example` if it doesn't exist), set
   `FASTAPI_SECRET` to a long random value. To generate one, in a terminal in the `Ai-service` folder:
   ```
   uv run python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```
   The **server** must use the **exact same** value (step 3 of *Connect the server*). Treat it like a
   password: don't paste it in chats or commit it.
5. **Keep the PC awake.** Windows **Settings → System → Power & sleep → Sleep: Never** (when plugged in).
   While the PC sleeps or is off, imports fail with "Could not reach the AI service"; users can still trace
   the plan by hand.

## Start it

Open a terminal (PowerShell or Git Bash) in the `Ai-service` folder:

```
docker compose -f compose.host.yml up -d --build
```

The first run downloads and builds a lot (PyTorch with CUDA, several GB) and can take 10–20 minutes. Later
starts take seconds. Then check:

```
docker compose -f compose.host.yml ps
```

`ai-service` should say **healthy** (allow ~1 minute after starting) and `tunnel` should say **running**.

## Get the public address (quick tunnel)

```
docker compose -f compose.host.yml logs tunnel
```

Look for a line containing **`https://<random-words>.trycloudflare.com`**. Open
`https://<random-words>.trycloudflare.com/health` in a browser. You should see:

```
{"status":"ok","service":"xplor-ai-service","detector":"unet","device":"cuda","error":null}
```

`"device":"cuda"` means the GPU is in use. `"cpu"` works too, just slower.

> ⚠️ **The quick-tunnel address changes every time the tunnel restarts** (PC reboot, Docker restart,
> `down`/`up`). Each time, repeat this step and update the server (next section). To stop that, set up a
> **permanent URL** (below) once you have a domain.

## Connect the server

If the server runs on this PC, one command does step 1 for you (run it in `Ai-service`, then restart the
server):

```
.\scripts\tunnel-url.ps1 -UpdateServerEnv
```

`.\scripts\tunnel-url.ps1 -Local` switches the server back to the AI service on `127.0.0.1:8000`.

Otherwise, on the server (its `.env` file, or the hosting dashboard's environment variables):

1. `FASTAPI_WEBHOOK_URL=https://<random-words>.trycloudflare.com/process-floor-plan`
2. `AI_SERVICE_TIMEOUT_MS=30000` (raise it if imports time out)
3. `FASTAPI_SECRET=<the same value as in Ai-service\.env>`
4. Restart the server so it picks up the new values.

Then import a floor plan from the dashboard. It should open in the 2D editor with detected walls.
The app's **System status** page (Dashboard → System status) should show the route as
**Cloudflare tunnel** and this PC's GPU; see `docs/guides/demo.md`.

## Everyday commands (in `Ai-service`)

| What | Command |
|---|---|
| Start / update after code changes | `docker compose -f compose.host.yml up -d --build` |
| Is it running? | `docker compose -f compose.host.yml ps` |
| Current tunnel address | `.\scripts\tunnel-url.ps1` (or `docker compose -f compose.host.yml logs tunnel`) |
| AI service log (errors, each detection) | `docker compose -f compose.host.yml logs ai-service` |
| Stop | `docker compose -f compose.host.yml down` |

Don't run the development server (`uv run uvicorn …`) at the same time; you don't need it for hosting.

## Permanent URL (named tunnel) — once you have a domain

A named tunnel keeps the same address (e.g. `https://ai.yourdomain.com`) across restarts. It needs a
free Cloudflare account with your domain added to it.

1. In the Cloudflare dashboard: **Zero Trust → Networks → Tunnels → Create a tunnel** → type
   **Cloudflared** → give it a name (e.g. `xplor-ai`).
2. On the "Install connector" page, choose **Docker** and copy only the **token** (the long string after
   `--token`). Keep it secret.
3. Under **Public Hostname**, add: subdomain `ai`, your domain, service type **HTTP**, URL
   **`ai-service:8000`**. Save.
4. In `Ai-service\.env`, set:
   ```
   COMPOSE_PROFILES=named-tunnel
   TUNNEL_TOKEN=<the token>
   ```
5. Restart: `docker compose -f compose.host.yml down` then
   `docker compose -f compose.host.yml up -d`.
6. Check `https://ai.yourdomain.com/health`, then set the server's
   `FASTAPI_WEBHOOK_URL=https://ai.yourdomain.com/process-floor-plan` once — it won't change again.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `ai-service` stays **unhealthy** | `docker compose -f compose.host.yml logs ai-service`. Usually the weights are missing (`Ai-service\Model\best.pt`) or `FASTAPI_SECRET` is empty or shorter than 32 characters. `/health` also shows the reason. |
| `/health` shows `"device":"cpu"` | Docker can't see the GPU: update the NVIDIA driver and Docker Desktop, then restart both. |
| Import fails with **HTTP 401** | The secrets differ: `FASTAPI_SECRET` must be identical on the server and in `Ai-service\.env` (restart both after changing). |
| Import fails with "Could not reach the AI service" | The PC is off/asleep, Docker isn't running, or the quick-tunnel address changed (get the new one and update the server). |
| Import fails with "did not respond within 30000ms" | Raise `AI_SERVICE_TIMEOUT_MS` on the server. |
| `tunnel` keeps restarting | `docker compose -f compose.host.yml logs tunnel`. With a named tunnel, check `TUNNEL_TOKEN`. |
