# Uses node version 22 as base image including linux environment
FROM node:22

# Creates the working directory file path to /app so inside the Docker image
# /app
#   ├── package.json
#   ├── package-lock.json
#   ├── server.js
#   ├── routes/
#   └── node_modules/
WORKDIR /app

# Copies over the dependencies from package.json and package-lock so npm knows what to install
COPY package.json package-lock.json ./

# Installs the dependencies described in package/package-lock.json
RUN npm ci --omit=dev

# Copies over all the code from all the different files into /app
COPY . .

# What port this app is running on
EXPOSE 3000

# How to run the app with the "start" scipt in package.json
CMD ["npm","start"]



