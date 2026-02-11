# Build stage
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Run stage
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server.js ./
RUN mkdir -p /app/data
EXPOSE 3001
ENV PORT=3001
ENV DB_PATH=/app/data/history.db
CMD ["node", "server.js"]
