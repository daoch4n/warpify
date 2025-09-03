# cf-proxy

> Proxy requests through Cloudflare (CF) workers with load balancing and high availability.

A simple worker that acts as a proxy to tunnel requests over the internet, forwarding them through Cloudflare's global network of servers. By leveraging multiple worker endpoints, this tool provides automatic IP address rotation, load balancing, and enhanced reliability. This is useful because Cloudflare's ASNs are often whitelisted on firewalls.

## Features

- **HTTP and SOCKS5 Proxy:** Supports both common proxy protocols.
- **Load Balancing:** Distributes traffic across multiple Cloudflare Worker endpoints using `random` or `round-robin` strategies.
- **High Availability:** Automatically retries failed connections with exponential backoff, improving resilience.
- **Configuration:** Easily configurable via a `config.json` file or command-line arguments.
- **Automatic IP Rotation:** Each request can potentially be routed through a different IP address from Cloudflare's network.

## Usage

You will need [Bun](https://bun.sh/) to run the client script. You can install it by running:

```bash
curl -fsSL https://bun.sh/install | bash
. ~/.bashrc
```

You also need a Cloudflare account to deploy the worker(s). A free account is sufficient for basic use.

Once you have Bun installed, install `wrangler`, the Cloudflare CLI:

```bash
bun i -g wrangler
```

Login to Cloudflare with `wrangler`:

```bash
wrangler login
```

### 1. Automated Deployment

For a streamlined setup, an automated deployment script is provided. This script will:
- Deploy two Cloudflare workers, `warpify0` and `warpify1`.
- Automatically generate a secure authorization token and apply it to both workers.
- Automatically generate a `config.json` file ready for use.
- Start the proxy client.

To run the script, first make it executable, then run it:

```bash
chmod +x deploy.sh
./deploy.sh
```

The script is designed to be safely re-runnable:
- It always resets `worker/wrangler.toml` back to `name = "warpify0"` at the end.
- It updates/overwrites the `TOKEN` secret for both workers on each run.
- It regenerates the `config.json` with the latest worker URLs and token.

Once the script is finished, the proxy will be running and configured.

### 2. Manual Setup

If you prefer to configure the client manually or need a more customized setup, follow these steps.

#### A. Deploy the Worker(s)

`cd` into the `worker/` directory, install dependencies, and deploy:

```bash
cd worker/
bun i
wrangler deploy
```

This will create a worker (e.g., `my-instance.workers.dev`). You can edit `worker/wrangler.toml` to change the name and deploy multiple times to create a pool of endpoints for load balancing.

For each worker you deploy, you must set its secret authorization token:

```bash
# Still in the worker/ directory
wrangler secret put TOKEN --name your-worker-name
```

#### B. Configure the Client

Copy the example configuration file:

```bash
cp config.example.json config.json
```

Now, edit `config.json` to add your worker endpoints and authorization token.

#### C. Run the Proxy

Once configured, start the proxy client from the project's root directory:

```bash
bun run start
```

### Command-Line Options

You can also override `config.json` settings using command-line arguments.

```
proxy.js - Proxy requests through CloudFlare workers
Usage: bun proxy.js [options]

Options:

-h, --help                Show this help message and exit
-p, --port <port>         Port to listen on
-a, --auth <token>        Authorization header
-w, --worker <endpoint>   Specify a worker endpoint (can be used multiple times)
-s, --strategy <strategy> Load balancing strategy ('random' or 'round-robin')
-t, --type <type>         Proxy type ('socks' or 'http')
-v, --verbose             Enable verbose mode (default: false)
--retry-enabled [bool]    Enable connection retries (pass false to disable)
```

**Example:**

```bash
bun proxy.js -a 'your-auth-token' -p 1080 -t socks -w my-instance-1.workers.dev -w my-instance-2.workers.dev
```

### Verify Your IP

To confirm that your IP has changed, configure your browser to use the proxy and visit a site like `https://myip.wtf/json`. Alternatively, from the command line:

```bash
# For an HTTP proxy on port 8080
curl -x http://localhost:8080 https://myip.wtf/json

# For a SOCKS5 proxy on port 1080
curl -x socks5h://localhost:1080 https://myip.wtf/json
```

## Limitations

By default, Cloudflare doesn't allow connections to port 25 of any target. Also, connecting to Cloudflare's address space from within a worker is not supported, so you might have problems accessing sites that are behind Cloudflare.
