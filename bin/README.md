Best available package for Amazon Linux 2023
https://mirror.stream.centos.org/9-stream/AppStream/x86_64/os/Packages/soundtouch-2.1.1-8.el9.x86_64.rpm

---

Building for Amazon Linux 2023 - On Windows
```shell
cd bin
docker build --tag soundtouch-builder --file Dockerfile .
docker run --rm --name soundtouch-builder -t -v %cd%\docker-volume:/home/soundtouch-out soundtouch-builder
copy /y docker-volume\soundstretch amazon-linux-2023-x86_64
```

---

Building for Amazon Linux 2023 - On Linux
```shell
cd bin
docker build --tag soundtouch-builder --file Dockerfile .
docker run --rm --name soundtouch-builder -t -v "$(pwd)"/docker-volume:/home/soundtouch-out soundtouch-builder
cp docker-volume/soundstretch ./amazon-linux-2023-x86_64/
```
