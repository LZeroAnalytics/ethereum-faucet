# Use an official Node.js runtime as a parent image
FROM node:20.18.0

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy the package.json and package-lock.json, then install dependencies
COPY package*.json ./
RUN npm install

# Install TypeScript and build the application
COPY . .
RUN npm install --only=dev
RUN npx tsc

# Copy the ABI file to the dist folder
#COPY src/contract_abi.json dist/

# Expose the faucet and monitoring ports
EXPOSE 8090

# Run the app
CMD ["node", "dist/index.js"]
