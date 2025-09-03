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

### 1. Deploy the Worker

`cd` into the `worker/` directory, install dependencies, and deploy:

```bash
cd worker/
bun i
wrangler deploy
```

This will create a worker (e.g., `my-instance.workers.dev`). You can deploy the same worker multiple times under different names to create a pool of endpoints for load balancing.

Next, you need to set a secret authorization token for your worker. This prevents unauthorized use.

```bash
# Still in the worker/ directory
wrangler secret put TOKEN
```

You will be prompted to enter the value for your secret token.

### 2. Configure the Client

The client can be configured using a `config.json` file in the project root. This is the recommended method.

Create a `config.json` file by copying the example:

```bash
cp config.example.json config.json
```

Now, edit `config.json` to add your worker endpoints and authorization token:

```json
{
  "worker": [
    "your-worker-1.workers.dev",
    "your-worker-2.workers.dev"
  ],
  "authorization": "your-auth-token-you-set-with-wrangler",
  "port": 1080,
  "type": "socks",
  "verbose": false,
  "retry_enabled": true,
  "max_retries": 5,
  "retry_initial_backoff": 1000,
  "retry_factor": 2,
  "load_balancing_strategy": "random"
}
```

### 3. Run the Proxy

Once configured, you can start the proxy client from the project's root directory:

```bash
bun run start
```

The client will read your `config.json` and start the proxy server. You can then configure your browser or application to use `127.0.0.1:1080` (or the port you specified) as a SOCKS5 or HTTP proxy.

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
--no-retry                Disable connection retries
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
