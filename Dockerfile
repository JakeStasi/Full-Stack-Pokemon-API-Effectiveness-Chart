# Uses node version 22 as base image
FROM node:22

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["npm","start"]



