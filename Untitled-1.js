io.on("connection", (socket) => {
  socket.on("joinRoom", async (roomId) => {
    try {
      const room = await Room.findById(roomId);
      if (!room) {
        socket.emit("error", "Room not found");
        return;
      }
      if (room.users.length >= 2) {
        socket.emit("error", "Room is full");
        return;
      }
      room.users.push({ socketId: socket.id, score: 0 });
      await room.save();
      socket.join(roomId);
      io.to(roomId).emit("roomUpdate", room);
    } catch (error) {
      console.error("Error handling joinRoom:", error);
      socket.emit("error", "An error occurred");
    }
  });

  socket.on("startGame", async (roomId) => {
    try {
      const room = await Room.findById(roomId);
      if (room) {
        room.questions = getRandomQuestions();
        await room.save();
        let questionIndex = 0;
        const interval = setInterval(() => {
          if (questionIndex < room.questions.length) {
            io.to(roomId).emit("question", room.questions[questionIndex]);
            questionIndex++;
          } else {
            clearInterval(interval);
            io.to(roomId).emit("endGame", room.users);
            Room.findByIdAndDelete(roomId);
          }
        }, 10000); // send a new question every 10 seconds
      }
    } catch (error) {
      console.error("Error handling startGame:", error);
      socket.emit("error", "An error occurred");
    }
  });

  socket.on("answer", async (data) => {
    const room = await Room.findById(data.roomId);
    const user = room.users.find((u) => u.socketId === socket.id);
    if (user) {
      const currentQuestion = room.questions[room.questions.length - 1];
      user.score += data.answer === currentQuestion.answer ? 10 : 0;
      await room.save();
    }
  });

  socket.on("endGame", async (roomId) => {
    const room = await Room.findById(roomId);
    if (room) {
      const results = room.users.map((u) => ({
        socketId: u.socketId,
        score: u.score,
      }));
      io.to(roomId).emit("gameResults", results);
      await Room.findByIdAndDelete(roomId);
    }
  });
});
