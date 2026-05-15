FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --include=dev
COPY . .
RUN npx tsc --skipLibCheck
CMD ["node", "dist/index.js"]
