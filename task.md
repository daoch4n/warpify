# Task: Implement Support for Multiple Worker Endpoints

The goal is to enhance the client to support connecting to a list of worker endpoints for load balancing and improved reliability.

## 1. Update Configuration Loading (`src/config.js`)

Modify the `loadConfig` function to:
- Handle the `worker` field in `config.json` being either a string or an array. If it's a string, convert it to an array with a single element.
- Load the new `load_balancing_strategy` setting from `config.json`.
- Add a new command-line argument `--worker <endpoint>` that can be specified multiple times. Each time this argument is used, it should add the endpoint to a `workers` array in the `options` object. If `config.json` also specifies workers, the command-line workers should be added to the list.
- Add a new command-line argument `--strategy <strategy>` to specify the load balancing strategy ('random' or 'round-robin').

## 2. Implement Load Balancing (`src/proxy-connector.js`)

Modify the `proxyConnect` function to:
- Import the `createLoadBalancer` function from `./load-balancer.js`.
- Create a load balancer instance using the `workers` and `load_balancing_strategy` from the `options` object.
- In the `connectOnce` function, before creating the WebSocket, call the load balancer's `getNextWorker()` method to get the worker endpoint for the current connection attempt.
- The existing retry logic should apply to the selected endpoint. If all retries for that endpoint fail, the connection should be considered failed.

## 3. Update Help Text (`proxy.js`)

Update the help text in `proxy.js` to document the new `--worker` and `--strategy` command-line options.