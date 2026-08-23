FROM node

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

ENV TERM=xterm-256color

EXPOSE 5050

CMD ["npm", "run"]