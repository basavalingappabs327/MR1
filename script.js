// Returns today's date as yyyy-mm-dd in the user's LOCAL timezone
// (toISOString() uses UTC, which can show yesterday's date early morning in India).
function getLocalToday() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const todayInput = document.getElementById("today");
  if (todayInput) {
    todayInput.value = getLocalToday();
  }
});

function addRow() {
  const tbody = document.getElementById("medicineTbody");
  const rowCount = tbody.rows.length + 1;
  const tr = document.createElement("tr");

  tr.innerHTML = `
    <td>${rowCount}</td>
    <td><input type="text" name="medicalshop[]" required></td>
    <td><input type="text" name="receipt[]" required></td>
    <td><input type="date" name="date[]" required></td>
    <td><input type="number" name="price[]" class="price-input" step="0.01" oninput="calculateTotal()" required></td>
    <td><button type="button" class="btn-danger" onclick="removeRow(this)">X</button></td>
  `;
  tbody.appendChild(tr);
}

function removeRow(button) {
  const tbody = document.getElementById("medicineTbody");
  if (tbody.rows.length > 1) {
    button.closest("tr").remove();
    reindexRows();
    calculateTotal();
  } else {
    alert("At least one entry is required for Form B.");
  }
}

function reindexRows() {
  const rows = document.querySelectorAll("#medicineTbody tr");
  rows.forEach((row, index) => {
    row.cells[0].innerText = index + 1;
  });
}

function calculateTotal() {
  const priceInputs = document.querySelectorAll(".price-input");
  let total = 0;
  priceInputs.forEach((input) => {
    const val = parseFloat(input.value) || 0;
    total += val;
  });
  document.getElementById("amount").value = total.toFixed(2);
}

function downloadPDF(base64Data, fileName) {
  const link = document.createElement("a");
  link.href = "data:application/pdf;base64," + base64Data;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Google Apps Script Web Apps occasionally return a transient error (e.g. HTTP 404/500)
// on the first request after being idle ("cold start"). Retrying a couple of times
// with a short delay resolves this without the user having to manually resubmit.
function submitWithRetry(scriptURL, formData, statusMsg, maxAttempts = 3, delayMs = 1500) {
  function attempt(attemptNumber) {
    if (attemptNumber > 1) {
      statusMsg.innerText = `Processing request... (retry ${attemptNumber - 1} of ${maxAttempts - 1})`;
    }

    return fetch(scriptURL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(formData)
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Server returned HTTP " + response.status);
        }
        return response.json();
      })
      .catch((error) => {
        if (attemptNumber < maxAttempts) {
          return new Promise((resolve) => setTimeout(resolve, delayMs)).then(() =>
            attempt(attemptNumber + 1)
          );
        }
        throw error;
      });
  }

  return attempt(1);
}

document.getElementById("medicalClaimForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const submitBtn = document.getElementById("submitBtn");
  const statusMsg = document.getElementById("statusMessage");

  submitBtn.disabled = true;

  const formData = {
    name: document.getElementById("name").value.trim(),
    office: document.getElementById("office").value.trim(),
    basic: document.getElementById("basic").value,
    designation: document.getElementById("designation").value.trim(),
    institution: document.getElementById("institution").value.trim(),
    address: document.getElementById("address").value.trim(),
    patientname: document.getElementById("patientname").value.trim(),
    patientguardian: document.getElementById("patientguardian").value.trim(),
    relationship: document.getElementById("relationship").value,
    illplace: document.getElementById("illplace").value.trim(),
    illness: document.getElementById("illness").value.trim(),
    from: document.getElementById("from").value,
    to: document.getElementById("to").value,
    hospital: document.getElementById("hospital").value.trim(),
    amount: document.getElementById("amount").value,
    today: document.getElementById("today").value,
    medicines: []
  };

  const rows = document.querySelectorAll("#medicineTbody tr");
  rows.forEach((row) => {
    formData.medicines.push({
      medicalshop: row.querySelector('[name="medicalshop[]"]').value.trim(),
      receipt: row.querySelector('[name="receipt[]"]').value.trim(),
      date: row.querySelector('[name="date[]"]').value,
      price: row.querySelector('[name="price[]"]').value
    });
  });

  // REPLACE WITH YOUR PUBLISHED APPS SCRIPT WEB APP URL
  const scriptURL = "https://script.google.com/macros/s/AKfycbxuXxKoEzwrkFFcZdSQQJEgzEXuaG_Uo0o7xlVg4cwRftEXksm9DNHSY_hesfTdIqe41g/exec";

  statusMsg.style.color = "#2b6cb0";
  statusMsg.innerText = "Processing request... Generating filled PDF document...";

  submitWithRetry(scriptURL, formData, statusMsg)
    .then((data) => {
      if (data.result === "success") {
        let secondsLeft = 20;
        statusMsg.style.color = "green";

        const timer = setInterval(() => {
          if (secondsLeft > 0) {
            statusMsg.innerText = `PDF Generated successfully! Downloading in ${secondsLeft} seconds...`;
            secondsLeft--;
          } else {
            clearInterval(timer);
            statusMsg.innerText = "pdf downloaded successfully...";
            downloadPDF(data.pdfBase64, data.fileName);
            document.getElementById("medicalClaimForm").reset();
            document.getElementById("today").value = getLocalToday();
            calculateTotal();
            submitBtn.disabled = false;
          }
        }, 1000);
      } else {
        throw new Error(data.error);
      }
    })
    .catch((error) => {
      statusMsg.style.color = "red";
      statusMsg.innerText = "Error: " + error.message;
      console.error("Error!", error);
      submitBtn.disabled = false;
    });
});
