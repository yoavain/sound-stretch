### Building for Amazon Linux 2023 - On Windows

---

Building for Amazon Linux 2023 - On Windows
```shell
docker build --tag soundtouch-builder --file Dockerfile .
docker run --rm --name soundtouch-builder -t -v %cd%\docker-volume:/home/soundtouch-out soundtouch-builder
copy /y docker-volume\soundstretch amazon-linux-2023-x86_64
```

---

### Building for Amazon Linux 2023 - On Linux
```shell
docker build --tag soundtouch-builder --file Dockerfile .
docker run --rm --name soundtouch-builder -t -v "$(pwd)"/docker-volume:/home/soundtouch-out soundtouch-builder
cp docker-volume/soundstretch ./amazon-linux-2023-x86_64/
```
