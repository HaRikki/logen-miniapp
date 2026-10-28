# Digital Store — single image: API + built frontend (backend serves frontend/dist)
FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm install --no-audit --no-fund
COPY backend backend
COPY frontend frontend
RUN npm run build -w frontend && npm run build -w backend

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /repo
RUN apt-get update && apt-get install -y python3 make g++ curl && rm -rf /var/lib/apt/lists/*
COPY package.json ./
COPY backend/package.json backend/
RUN npm install --omit=dev --no-audit --no-fund -w backend
COPY --from=build /repo/backend/dist backend/dist
COPY --from=build /repo/frontend/dist frontend/dist
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD curl -fsS http://localhost:3000/api/health || exit 1
CMD ["sh", "-c", "node backend/dist/db/cli.js migrate ${DB_CLIENT:-postgres} && node backend/dist/index.js"]
