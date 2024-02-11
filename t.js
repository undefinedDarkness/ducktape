document.addEventListener("DOMContentLoaded", () => {
  window["DUCK"] = {
    outbox: [],
    callbacks: {},
    nId: 0,
    send(msg) {
      const tkn = this.nId++;
      this.outbox.push({ tkn: tkn, msg: msg });
      window["🦆💬"]("recv");
      return new Promise((res) => {
        window["DUCK"].callbacks[tkn.toString()] = res;
      });
    },
    recv(data) {
      const tkn = data.tkn;
      const resp = data.msg;
      window["DUCK"].callbacks[tkn.toString()](resp);
      delete window["DUCK"].callbacks[tkn.toString()];
    },
  };
  alert("🦆 API ENABLED");
});
