const express = require("express");
const http = require("http");
const _ = require("lodash");
const socketIo = require("socket.io");
const { create } = require("express-handlebars");
const path = require("path");
const mongoose = require("mongoose");
const Room = require("./models/Room");
const User = require("./models/User");
const { check, validationResult } = require("express-validator");
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");
var session = require("express-session");
var logger = require("morgan");
const nocache = require("nocache");
const sharedsession = require("express-socket.io-session");
require("dotenv").config();
const dbURI = process.env.MONGODB_URI;
mongoose
  .connect(dbURI)
  .then(() => {
    console.log("mongo db connected.");
  })
  .catch((err) => {
    console.log(err, "error");
  });
let questions = [
  {
    question: "What is 2 + 2?",
    options: ["3", "4", "5", "6"],
    answer: "4",
  },
  {
    question: "What is the capital of France?",
    options: ["Berlin", "Madrid", "Paris", "Rome"],
    answer: "Paris",
  },
  {
    question: 'Who wrote "To Kill a Mockingbird"?',
    options: [
      "Harper Lee",
      "Mark Twain",
      "Ernest Hemingway",
      "F. Scott Fitzgerald",
    ],
    answer: "Harper Lee",
  },
  {
    question: "What is the largest planet in our solar system?",
    options: ["Earth", "Mars", "Jupiter", "Saturn"],
    answer: "Jupiter",
  },
  {
    question: "Who painted the Mona Lisa?",
    options: [
      "Vincent van Gogh",
      "Pablo Picasso",
      "Leonardo da Vinci",
      "Claude Monet",
    ],
    answer: "Leonardo da Vinci",
  },
];
const hbs = create({
  extname: ".handlebars",
  defaultLayout: "main",
  layoutsDir: path.join(__dirname, "views/layouts"),
  partialsDir: path.join(__dirname, "views/partials"),
  helpers: {
    getProperty: function (obj, prop) {
      return obj[prop];
    },
    lt: function (a, b) {
      return a < b;
    },
    gt: function (a, b) {
      return a >= b;
    },
    length: function (arr) {
      return arr ? arr.length : 0;
    },
    and: function (a, b, options) {
      if (a && b) {
        return options.fn(this);
      } else {
        return options.inverse(this);
      }
    },
  },
});

app.engine(".handlebars", hbs.engine);
app.set("view engine", ".handlebars");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: "thisismysecretkey",
    saveUninitialized: true,
    // cookie: { maxAge: 7000000000000 },
    resave: false,
  })
);
app.use(nocache());

app.get("/lobyy", async (req, res) => {
  try {
    if (req.session && req.session.userid) {
      let name;
      const rooms = await Room.find();
      const user = await User.findOne({
        _id: req.session.user_id,
      });
      if (user) {
        name = user._doc.name;
      }
      const message = rooms.length === 0 ? "Please create a new room" : null;
      let user_room = false;

      _.each(rooms, function (room) {
        let users = room.users;
        if (users.length) {
          _.each(rooms, function (user) {
            if (user.user_id == req.session.userid) {
              room.acessible = false;
            } else {
              room.acessible = true;
            }
          });
        }
      });

      res.render("lobby", {
        rooms,
        message,
        user_id: req.session.user_id,
        name,
      });
    } else {
      res.redirect("/");
    }
  } catch (error) {
    console.log(error);
  }
});

app.post("/rooms", async (req, res) => {
  if (req.session.user_id) {
    res.render("newroom");
  } else {
    res.redirect("/");
  }
});
app.post("/createRoom", async (req, res) => {
  try {
    const { userName, roomName } = req.body;

    const newRoom = new Room({
      name: roomName,
      users: [
        {
          name: userName,
          socketId: null,
          score: 0,
          user_id: req.session.user_id,
        },
      ],
      questions: questions,
    });
    await newRoom.save();

    res.redirect("/lobyy");
  } catch (error) {
    console.log(error);
  }
});

io.on("connection", (socket) => {
  socket.on("joinRoom", async (roomId) => {
    try {
      const room = await Room.findById(roomId.roomId);

      if (!room) {
        socket.emit("error", "Room not found");
        return;
      }

      if (room.users.length >= 2) {
        socket.emit("error", "Room is full");
        return;
      }

      let existingUser = _.find(room.users, function (user_ids) {
        return user_ids.user_id == roomId.userId;
      });

      if (!existingUser) {
        room.users.push({
          socketId: socket.id,
          score: 0,
          user_id: roomId.userId,
        });
        await room.save();
        socket.join(roomId);
        io.to(roomId).emit("roomUpdate", room);
      } else {
      }
      // Optionally, generate user_id if needed here
      // const user_id = generateCustomId();

      //   if (room.users.length === 2) {
      //     io.to(roomId).emit("startGame");
      //   }
    } catch (error) {
      console.error("Error handling joinRoom:", error);
      socket.emit("error", "An error occurred");
    }
  });
  socket.on("startGame", async (roomId) => {
    const room = await Room.findById(roomId);

    if (room) {
      room.questions = getRandomQuestions();
      socket.roomQuestionIndex = 0;
      try {
        socket.emit("question", { question: room.questions[0], index: 0 });
      } catch (error) {
        console.log(error);
      }
    }
  });
  socket.on("nextQuestion", async (roomId) => {
    const room = await Room.findById(roomId.roomId);
    if (room && socket.roomQuestionIndex !== undefined) {
      socket.roomQuestionIndex += 1;
      if (socket.roomQuestionIndex < 5) {
        socket.emit("question", {
          question: room.questions[socket.roomQuestionIndex],
          index: socket.roomQuestionIndex,
        });
      } else {
        socket.emit("gameOver", {
          announcement: "congargulatins you successfully compltes the game",
          is_complted: true,
          score: roomId.score,
        });
        setTimeout(async () => {
          await Room.findByIdAndDelete(roomId.roomId);
          socket.emit("roomDeleted", {
            message: "Room has been deleted after 55 seconds.",
          });
        }, 5000);
      }
    }
  });
});

app.get("/startgame/:roomId", async (req, res) => {
  try {
    // session.userid
    if (req.session.userid) {
      const { roomId } = req.params;
      let room_name = undefined;
      const room = await Room.findById(roomId);
      if (room && room.name) {
        room_name = room.name;
      }

      res.render("startgame", { roomId, room_name });
    } else {
      res.redirect("/");
    }
  } catch (error) {
    console.log(error);
  }
});
function getRandomQuestions() {
  const shuffled = questions.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 5);
}

app.get("/signup", function (req, res) {
  if (req.session && req.session.useralreadyexist) {
    res.render("signup", { usernameMsg: "Username already exist" });
    req.session.destroy();
  } else {
    res.render("signup");
  }
});
app.get("/", function (req, res) {
  req.session;
  if (req.session && req.session.userid) {
    res.redirect("/lobyy");
  } else if (req.session && req.session.incorrectid) {
    const item = [{ message: "Username does not exist" }];
    res.render("login", { item });
    req.session.destroy();
  } else if (req.session && req.session.incorrectpwd) {
    const item = [{ message: "Incorrect password" }];
    res.render("login", { item });
    req.session.destroy();
  } else {
    res.render("login");
  }
});
app.post(
  "/signup",

  function (req, res) {
    const errors = validationResult(req);

    var error1 = errors.errors.find((item) => item.param === "name") || "";
    var error2 = errors.errors.find((item) => item.param === "username") || "";
    var error3 = errors.errors.find((item) => item.param === "password") || "";

    if (!errors.isEmpty()) {
      res.render("signup", {
        nameMsg: error1.msg,
        usernameMsg: error2.msg,
        pwdMsg: error3.msg,
      });
    } else {
      User.find({ username: req.body.username })
        .then((result) => {
          let b = result.find((item) => item.username);
          let hashPassword;
          bcrypt
            .hash(req.body.password, 10)
            .then(function (hash) {
              hashPassword = hash;
              if (b) {
                req.session.useralreadyexist = true;
                res.redirect("/signup");
              } else {
                const user = new User({
                  name: req.body.name,

                  username: req.body.username,
                  password: hashPassword,
                });
                user
                  .save()
                  .then((result) => {
                    console.log("success");
                  })
                  .catch((err) => {
                    console.log(err);
                  });
                res.redirect("/");
              }
            })
            .catch((err) => {
              console.log(err);
            });
        })
        .catch((err) => {
          console.log(err);
        });
    }
  }
);
app.post("/lobyy", function (req, res) {
  let temp;
  User.find({ username: req.body.username })
    .then((result) => {
      temp = result.find((item) => item.username);
      currentUser = temp.name;
      userData = temp.data;
      bcrypt.compare(req.body.password, temp.password).then(function (result) {
        if (result) {
          req.session.userid = true;
          req.session.user_id = temp._id;
          res.redirect("/lobyy");
        } else {
          req.session.incorrectpwd = true;
          res.redirect("/");
        }
      });
    })
    .catch((err) => {
      console.log(err);

      req.session.incorrectid = true;
      res.redirect("/");
    });
});
app.post("/logout", function (req, res) {
  req.session.userid = false;
  req.session.incorrectid = false;
  req.session.incorrectpwd = false;
  req.session.useralreadyexist = false;
  res.redirect("/");
});

server.listen(process.env.PORT, () => {
  console.log("Server is running on port 3000");
});
