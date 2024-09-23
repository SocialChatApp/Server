# base image
FROM node:16-alpine

# set working directory
WORKDIR /app

# copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# copy project files
COPY . .

# build project
RUN npm run build

# start application
CMD ["npm", "run", "start:prod"]
