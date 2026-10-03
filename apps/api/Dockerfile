FROM node

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

ENV TERM=xterm-256color
ENV PORT=5050

EXPOSE 5050

CMD ["npm", "start"]