# YouTube PO token provider for the server's yt-dlp (YTDLP_POT_PROVIDER_URL).
# Runs beside the API on its private network: no published port, no domain.
#
# The deno build of bgutil 2.0.2, because the node build ships Node 26.10.0
# with an exploited critical CVE that the production image scan blocks. The
# published image's Debian base is stale, so the security updates are applied
# here; rebuild to pick up new ones. Keep this version in step with the plugin
# version in Dockerfile.server.
FROM brainicism/bgutil-ytdlp-pot-provider:2.0.2-deno@sha256:addc137188b8f2be54b17bb0a919a3847cd417d143162e74d2fe9b410e586bcd
USER root
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*
USER deno
EXPOSE 4416
