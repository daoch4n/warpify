# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Architecture

- The project is a Cloudflare Worker that functions as a WebSocket proxy.
- It requires an `Authorization` header for authentication and an `X-Proxy-Target` header to specify the target service.
- The main entry point is `src/index.js`, which contains the core logic for handling WebSocket connections.

## Code Style

- The codebase uses modern JavaScript (ES modules).
- Error handling is managed with try-catch blocks, returning a 500 status code on failure.