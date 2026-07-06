FROM alpine:3.20
RUN apk add --no-cache g++ python3
COPY server.py /srv/server.py
EXPOSE 8080
CMD ["python3", "/srv/server.py"]
