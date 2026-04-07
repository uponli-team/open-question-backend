# Use an official Node.js runtime as a parent image
FROM node:18-slim

# Create and change to the app directory
WORKDIR /usr/src/app

# Copy application dependency manifests to the container image.
# A wildcard is used to ensure both package.json AND package-lock.json are copied.
# Copying this separately prevents re-running npm install on every code change.
COPY package*.json ./

# Install production dependencies.
RUN npm install --only=production

# Copy local code to the container image.
COPY . .

# Service listens on port 5000 by default (as per our server.js)
# Cloud Run will override this with the PORT environment variable.
EXPOSE 5000

# Run the web service on container startup.
CMD [ "npm", "start" ]
