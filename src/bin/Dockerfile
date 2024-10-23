FROM public.ecr.aws/amazonlinux/amazonlinux:2023@sha256:75763d26a28070a9ac04d0250585119566734b1f5182474afd4cb062a26ef07f

WORKDIR /home
COPY build.sh /home
RUN chmod +x build.sh

CMD ["./build.sh"]
