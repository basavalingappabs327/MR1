// REPLACE WITH YOUR GOOGLE DOC TEMPLATE ID. Kept as a top-level constant (rather than
// local to doPost) so keepAlivePing() below can reference the same value.
var TEMPLATE_DOC_ID = "1TVN313ePOGrbYoDl-1k3nyfbkW678H9dAI33ftQc-yU";

// Converts a date string from the HTML <input type="date"> format (yyyy-mm-dd)
// into dd-mm-yyyy for display in the generated document.
// Any value that doesn't match yyyy-mm-dd is returned unchanged (so it fails safe).
function formatDateDMY(dateStr) {
  if (!dateStr) return "";
  var match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateStr;
  return match[3] + "-" + match[2] + "-" + match[1];
}

// Replaces every occurrence of {key} in the document body with value.
// Backslashes and "$" are escaped so user input can never be misread as a
// regex back-reference in replaceText().
function replacePlaceholder(body, key, value) {
  var safe = String(value == null ? "" : value)
    .replace(/\\/g, "\\\\")
    .replace(/\$/g, "\\$");
  body.replaceText("\\{" + key + "\\}", safe);
}

// Optional "keep-warm" ping — set up a time-driven trigger (see instructions below)
// to call this every 5-10 minutes. This touches DriveApp specifically, since that's
// one of the services doPost() relies on. NOTE: Google does not officially guarantee
// this prevents cold starts on the Web App's doPost/doGet handlers; it's a best-effort
// community workaround, not a documented feature. A metadata-only read like this is
// negligible against your Drive quota, so it's safe to run every few minutes.
// To enable: open this project in the Apps Script editor -> click the clock icon
// ("Triggers") in the left sidebar -> Add Trigger -> choose function "keepAlivePing",
// event source "Time-driven", type "Minutes timer", every 5 or 10 minutes -> Save.
function keepAlivePing() {
  // Touch the template file to keep DriveApp & DocumentApp warm in memory
  DriveApp.getFileById(TEMPLATE_DOC_ID).getName();
}

// Note: the frontend (index.html/script.js/style.css) is hosted on GitHub Pages,
// so this Web App only needs to handle POST requests from that page. If you ever visit
// the Apps Script /exec URL directly in a browser (a GET request), it will just return
// the JSON error below instead of a form.
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      "result": "error",
      "error": "This endpoint only accepts POST requests from the claim form."
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // 1. Copy Template Document
    var templateFile = DriveApp.getFileById(TEMPLATE_DOC_ID);
    var docName = "Medical_Claim_" + data.name + "_" + Utilities.formatDate(new Date(), "GMT+5:30", "yyyy-MM-dd");
    var newFile = templateFile.makeCopy(docName);
    var doc = DocumentApp.openById(newFile.getId());
    var body = doc.getBody();

    // 2. Replace {pagebreak} placeholder with a native Document PageBreak
    var foundElement = body.findText("\\{pagebreak\\}");
    while (foundElement) {
      var element = foundElement.getElement();
      var parent = element.getParent();

      // Get position of the placeholder paragraph and insert a Page Break before removing it
      if (parent.getType() == DocumentApp.ElementType.PARAGRAPH) {
        var index = body.getChildIndex(parent);
        body.insertPageBreak(index);
        parent.removeFromParent();
      } else {
        element.asText().setText("");
      }

      foundElement = body.findText("\\{pagebreak\\}");
    }

    // 3. Populate Medicine Table in Form B (last table in the document).
    //    Template layout: row 0 = header, row 1 = sample row
    //    ({medicalshop} | Enclosed | {receipt}/{date} | {price}), rows 2+ = blank.
    //    The sample row is cloned so every medicine keeps the template's formatting.
    //    Done BEFORE the global replacements so these row placeholders are simply overwritten.
    var tables = body.getTables();
    if (tables.length > 0) {
      var medTable = tables[tables.length - 1];

      if (medTable.getNumRows() > 1) {
        var sampleRow = medTable.getRow(1).copy();

        // Remove everything below the header row
        while (medTable.getNumRows() > 1) {
          medTable.removeRow(1);
        }

        var medicines = (data.medicines && data.medicines.length > 0) ? data.medicines : [{}];
        medicines.forEach(function (med, i) {
          var row = medTable.appendTableRow(sampleRow.copy());
          row.getCell(0).setText((i + 1).toString());
          row.getCell(1).setText(med.medicalshop || "");
          row.getCell(2).setText("Enclosed");
          row.getCell(3).setText((med.receipt || "") + " / " + formatDateDMY(med.date));
          row.getCell(4).setText(med.price ? "\u20B9" + med.price : "");
        });
      }
    }

    // 4. Replace text placeholders (Form C + Form B)
    replacePlaceholder(body, "name", data.name);
    replacePlaceholder(body, "office", data.office);
    replacePlaceholder(body, "basic", data.basic);
    replacePlaceholder(body, "designation", data.designation);
    replacePlaceholder(body, "institution", data.institution);
    replacePlaceholder(body, "address", data.address);
    replacePlaceholder(body, "patientname", data.patientname);
    replacePlaceholder(body, "patientguardian", data.patientguardian);
    replacePlaceholder(body, "relationship", data.relationship);
    replacePlaceholder(body, "illplace", data.illplace);
    replacePlaceholder(body, "illness", data.illness);
    replacePlaceholder(body, "from", formatDateDMY(data.from));
    replacePlaceholder(body, "to", formatDateDMY(data.to));
    replacePlaceholder(body, "hospital", data.hospital);
    replacePlaceholder(body, "amount", data.amount);   // used twice in Form C (rows 9 & 10)
    replacePlaceholder(body, "today", formatDateDMY(data.today)); // only if {today} exists in template

    doc.saveAndClose();

    // 5. Convert Document to PDF
    var pdfBlob = newFile.getAs(MimeType.PDF);
    pdfBlob.setName(docName + ".pdf");

    // Clean up temporary Doc file from Drive
    DriveApp.getFileById(newFile.getId()).setTrashed(true);

    // Encode PDF to Base64
    var pdfBase64 = Utilities.base64Encode(pdfBlob.getBytes());

    return ContentService
      .createTextOutput(JSON.stringify({
        "result": "success",
        "pdfBase64": pdfBase64,
        "fileName": docName + ".pdf"
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ "result": "error", "error": err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
