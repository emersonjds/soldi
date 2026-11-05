# syntax=docker/dockerfile:1
# One image, one origin (D5): the Next.js export is served by the server from SOLDI_WEB_DIR.
# No BuildKit cache mounts: Railway's builder rejects cache ids without its service prefix.

FROM node:24-trixie-slim@sha256:a6155384446670e9719bdc4fd0ebe4d4b29fb32a8d6aa523da3547a6cfbcf22c AS web
WORKDIR /web
RUN corepack enable
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

FROM rust:slim-trixie@sha256:00544ccc9431a2fe93e65185d21381b0a039342f5cefcf84fbddac273c9e573d AS server
WORKDIR /src
ENV SQLX_OFFLINE=true CARGO_PROFILE_RELEASE_STRIP=true
COPY . .
RUN cargo build --release --locked -p soldi-server --bin soldi-server \
    && cp target/release/soldi-server /soldi-server

# Static busybox gives the distroless image a wget for the healthcheck.
FROM busybox:1.38-musl@sha256:ea2b9914a16a4ac1981994af97b318f7c7d4db76b580c56177f08bf76f4a0be8 AS busybox

FROM gcr.io/distroless/cc-debian13:nonroot@sha256:83b9b50586253821cf63ffcec87d3d94265a093ad30da232039af962dd8f4edf
COPY --from=busybox /bin/busybox /usr/local/bin/wget
COPY --from=server /soldi-server /usr/local/bin/soldi-server
COPY --from=web /web/out /web
ENV PORT=8080 SOLDI_WEB_DIR=/web
USER nonroot
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
    CMD ["/usr/local/bin/wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/api/health"]
ENTRYPOINT ["/usr/local/bin/soldi-server"]
