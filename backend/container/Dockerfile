FROM alpine:3.20
RUN apk add --no-cache g++ python3 \
 && adduser -D -u 1000 runner
COPY server.py /srv/server.py
EXPOSE 8080
# server runs as root on purpose: it setuids down to `runner` for the
# untrusted workload and needs root to reap runner's processes by uid.
CMD ["python3", "/srv/server.py"]
