FROM denoland/deno:1.21.0
EXPOSE 8877
WORKDIR /usr/src/app 
ADD . .
CMD ["run", "--unstable", "--allow-net","--allow-write", "--allow-read", "server.ts"] 