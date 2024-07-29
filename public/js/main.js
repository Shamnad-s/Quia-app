document.addEventListener("DOMContentLoaded", () => {
  const socket = io();
  let timer;
  let currentQuestion_id = "";
  let currentAnswer = "";
  socket.on("timeout", () => {
    document.getElementById("submitAnswerButton").disabled = true;
  });
  function joinRoom(roomId) {
    const userId = localStorage.getItem("user_id");

    if (userId) {
      socket.emit("joinRoom", { roomId, userId });
    } else {
      console.error("User ID not found in local storage");
    }
    window.location.href = `/startgame/${roomId}`;
  }
  socket.on("gameOver", (data) => {
    document.getElementById(
      "questionText"
    ).innerText = `Congagulation you have got ${data.score} points`;
    // document.getElementById("nextQuestionButton").style.display = "none";
    document.getElementById("submitAnswerButton").style.display = "none";
    document.getElementById("answerInput").style.display = "none";
    document.getElementById("optionsList").style.display = "none";
    setTimeout(() => {
      window.location.href = `/lobyy`;
    }, 6000);
  });

  window.joinRoom = joinRoom;

  function startGame(roomId) {
    socket.emit("startGame", roomId);
    document.getElementById("congratsMessage").style.display = "none";
    document.getElementById("startGameButton").style.display = "none";
    document.getElementById("questionContainer").style.display = "block";
  }

  socket.on("question", (data) => {
    const { question, options, answer, index } = data.question;
    currentAnswer = answer; // Update the current answer

    currentQuestion_id = data.question._id;
    // Update the question and options in the DOM
    document.getElementById("questionText").innerText = question;
    const optionsList = document.getElementById("optionsList");
    optionsList.innerHTML = "";
    options.forEach((option, index) => {
      const li = document.createElement("li");
      li.innerHTML = `<label>
                        <input type="radio" name="answer" value="${option}">
                        ${option}
                      </label>`;
      optionsList.appendChild(li);
    });
    startTimer();
    document.getElementById("questionContainer").style.display = "block";
  });
  function moveToNextQuestion() {
    const roomId = document.getElementById("submitAnswerButton").dataset.roomId;
    socket.emit("nextQuestion", { roomId: roomId, score: score });
  }
  document.getElementById("startGameButton").addEventListener("click", () => {
    const roomId = document.getElementById("startGameButton").dataset.roomId;

    startGame(roomId);
  });
  socket.on("connect", () => {
    console.log("Connected to the server.");
  });
  function startTimer() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      document.querySelectorAll('input[name="answer"]').forEach((input) => {
        input.disabled = true;
      });
      moveToNextQuestion();
    }, 10000);
  }
  let score = 0;
  document
    .getElementById("submitAnswerButton")
    .addEventListener("click", () => {
      const selectedOption = document
        .querySelector('input[name="answer"]:checked')
        .value.trim();

      const roomId =
        document.getElementById("submitAnswerButton").dataset.roomId;

      if (selectedOption.toLowerCase() === currentAnswer.toLowerCase()) {
        score += 10;
        document.getElementById("score").innerText = `Score: ${score}`;
        const userAnswer = document.getElementById("answerInput").value.trim();
        document.getElementById("answerInput").value = "";

        socket.emit("nextQuestion", { roomId: roomId, score: score });
      } else {
        socket.emit("nextQuestion", { roomId: roomId, score: score });
      }
    });
});
