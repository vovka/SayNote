# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package*.json ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
RUN npm install

FROM deps AS dev
ENV NODE_ENV=development
EXPOSE 3000
CMD ["npm", "run", "-w", "frontend", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]

FROM deps AS builder
COPY . .
RUN npm run -w frontend build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/frontend/package.json ./frontend/package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/frontend/.next ./frontend/.next
COPY --from=builder /app/frontend/public ./frontend/public
COPY --from=builder /app/frontend/app ./frontend/app
COPY --from=builder /app/frontend/lib ./frontend/lib
EXPOSE 3000
CMD ["npm", "run", "-w", "frontend", "start"]
