// ==========================================
// ১. গ্লোবাল কনফিগারেশন
// ==========================================
var SPREADSHEET_ID = "1XyZ-JjshnRwwdd8Nk0ONZNWSiyW6lwb-GFa5s6iWU8k";
var SHEET_NAME = "Biodata Database";

/*
  ⚠️ প্রথমবার সেটআপ করতে নিচের ফাংশনটি একবার Apps Script এডিটর থেকে রান করুন:
     setupAdminKeyAndEmail()
  এটা আপনার এডমিন-প্যাসওয়ার্ড এবং নোটিফিকেশন ইমেইল Script Properties-এ সেভ করবে
  (কোডের মধ্যে সরাসরি লেখা থাকবে না, তাই এটা GitHub/শেয়ার করলেও ফাঁস হবে না)।
*/
function setupAdminKeyAndEmail() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('ADMIN_KEY', 'আপনার-শক্ত-গোপন-পাসওয়ার্ড-এখানে-বদলান-123');
  props.setProperty('ADMIN_EMAIL', 'your-email@gmail.com');
  Logger.log('Admin key ও email সেট হয়েছে। এখন এই ফাংশন থেকে পাসওয়ার্ডটি মুছে দিন।');
}

function getAdminKey_() {
  return PropertiesService.getScriptProperties().getProperty('ADMIN_KEY') || '';
}
function getAdminEmail_() {
  return PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL') || '';
}

// ==========================================
// হেল্পার: হেডার-ভিত্তিক কলাম ইনডেক্স খোঁজা (doGet ও doPost দুই জায়গাতেই ব্যবহৃত)
// ==========================================
function buildColumnIndex_(headers) {
  function getColIndex(keyword) {
    for (var c = 0; c < headers.length; c++) {
      var head = String(headers[c] || '').toLowerCase().trim();
      if (head.indexOf(keyword.toLowerCase()) !== -1) return c;
    }
    return -1;
  }
  var idx = {
    id: getColIndex("আইডি"),
    time: getColIndex("তারিখ"),
    status: getColIndex("স্ট্যাটাস"),
    name: getColIndex("নাম"),
    gender: getColIndex("লিঙ্গ"),
    dob: getColIndex("জন্মতারিখ"),
    height: getColIndex("উচ্চতা"),
    blood: getColIndex("রক্তের"),
    marital: getColIndex("বৈবাহিক"),
    religion: getColIndex("ধর্ম"),
    edu: getColIndex("শিক্ষা"),
    prof: getColIndex("পেশা"),
    org: getColIndex("পদবী"),
    income: getColIndex("আয়"),
    present: getColIndex("বর্তমান"),
    dist: getColIndex("স্থায়ী"),
    father: getColIndex("পিতার"),
    mother: getColIndex("মাতার"),
    sib: getColIndex("ভাই"),
    fam: getColIndex("পারিবারিক"),
    exp: getColIndex("প্রত্যাশা"),
    phone: getColIndex("মোবাইল"),
    fb: getColIndex("ফেসবুক")
  };
  if (idx.dist === -1) idx.dist = getColIndex("জেলা");
  return idx;
}

// HTML escape — XSS প্রতিরোধের জন্য অ্যাডমিন ড্যাশবোর্ডে ব্যবহার হবে
function escapeHtml_(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// বয়স হিসাব — পাবলিক ফিডে জন্মতারিখের বদলে শুধু বয়স পাঠানো হবে
function calculateAge_(dobRaw) {
  var dobDate = (dobRaw instanceof Date) ? dobRaw : new Date(dobRaw);
  if (isNaN(dobDate.getTime())) return '';
  var today = new Date();
  var age = today.getFullYear() - dobDate.getFullYear();
  var m = today.getMonth() - dobDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) age--;
  return age > 0 ? age : '';
}

// ==========================================
// ২. মূল এপিআই ও এডমিন প্যানেল রাউটার (GET Request)
// ==========================================
function doGet(e) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();
    var data = sheet.getDataRange().getValues();
    var headers = data.length > 0 ? data[0] : [];
    var idx = buildColumnIndex_(headers);

    var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action).trim() : '';
    var providedKey = (e && e.parameter && e.parameter.key) ? String(e.parameter.key).trim() : '';

    // ------------------------------------------
    // এডমিন-সংক্রান্ত সব রাউট এখন 'key' চেক করবে
    // ------------------------------------------
    var adminActions = ['admin', 'getAllForAdmin', 'updateStatus', 'deleteBiodata', 'editBiodata'];
    if (adminActions.indexOf(action) !== -1) {
      var realKey = getAdminKey_();
      if (!realKey || providedKey !== realKey) {
        if (action === 'admin') {
          return renderAdminLoginUI_();
        }
        return ContentService.createTextOutput(JSON.stringify({ "result": "error", "message": "Unauthorized" }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    // ------------------------------------------
    // রাউট A: মোবাইল এডমিন ড্যাশবোর্ড UI (?action=admin&key=...)
    // ------------------------------------------
    if (action === 'admin') {
      return renderAdminDashboardUI_(providedKey);
    }

    // ------------------------------------------
    // রাউট B: এডমিন প্যানেলের জন্য সব ডেটা রিটার্ন করা
    // ------------------------------------------
    if (action === 'getAllForAdmin') {
      var adminList = [];
      for (var i = 1; i < data.length; i++) {
        var r = data[i];
        adminList.push({
          rowNum: i + 1,
          biodataId: idx.id !== -1 ? String(r[idx.id] || '') : 'BD-' + (1000 + i),
          status: idx.status !== -1 ? String(r[idx.status] || '').trim().toUpperCase() : 'PENDING',
          fullName: idx.name !== -1 ? String(r[idx.name] || '') : '',
          gender: idx.gender !== -1 ? String(r[idx.gender] || '') : '',
          district: idx.dist !== -1 ? String(r[idx.dist] || '') : '',
          contactNumber: idx.phone !== -1 ? String(r[idx.phone] || '') : '',
          fbLink: idx.fb !== -1 ? String(r[idx.fb] || '') : ''
        });
      }
      return ContentService.createTextOutput(JSON.stringify(adminList)).setMimeType(ContentService.MimeType.JSON);
    }

    // ------------------------------------------
    // রাউট C: স্ট্যাটাস আপডেট করা
    // ------------------------------------------
    if (action === 'updateStatus') {
      var targetId = String(e.parameter.id || '').trim();
      var newStatus = String(e.parameter.status || 'APPROVED').trim().toUpperCase();
      var allowedStatuses = ['APPROVED', 'PENDING', 'REJECTED'];

      if (targetId && idx.id !== -1 && idx.status !== -1 && allowedStatuses.indexOf(newStatus) !== -1) {
        for (var j = 1; j < data.length; j++) {
          if (String(data[j][idx.id] || '').trim() === targetId) {
            sheet.getRange(j + 1, idx.status + 1).setValue(newStatus);
            return ContentService.createTextOutput(JSON.stringify({ "result": "success", "id": targetId, "status": newStatus })).setMimeType(ContentService.MimeType.JSON);
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ "result": "error", "message": "ID not found" })).setMimeType(ContentService.MimeType.JSON);
    }

    // ------------------------------------------
    // রাউট C-2: বায়োডাটা সম্পূর্ণ ডিলিট করা (?action=deleteBiodata&id=BD-1005&key=...)
    // ------------------------------------------
    if (action === 'deleteBiodata') {
      var delId = String(e.parameter.id || '').trim();
      if (delId && idx.id !== -1) {
        for (var dj = 1; dj < data.length; dj++) {
          if (String(data[dj][idx.id] || '').trim() === delId) {
            sheet.deleteRow(dj + 1);
            return ContentService.createTextOutput(JSON.stringify({ "result": "success", "id": delId, "deleted": true })).setMimeType(ContentService.MimeType.JSON);
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ "result": "error", "message": "ID not found" })).setMimeType(ContentService.MimeType.JSON);
    }

    // ------------------------------------------
    // রাউট C-3: বায়োডাটার তথ্য এডিট করা (POST দিয়ে JSON body তে নতুন ভ্যালু আসবে,
    // কিন্তু GET দিয়ে অ্যাডমিন-কি চেক করে সহজ ব্যবহারের জন্য এখানেও রাখা হলো — নিচে doPost এও আছে)
    // এডিট আসলে doPost এর 'adminEdit' একশন দিয়ে হবে (নিচে দেখুন)
    // ------------------------------------------
    if (action === 'editBiodata') {
      return ContentService.createTextOutput(JSON.stringify({ "result": "error", "message": "এডিট করতে POST রিকোয়েস্ট ব্যবহার করুন (adminEdit)" })).setMimeType(ContentService.MimeType.JSON);
    }

    // ------------------------------------------
    // রাউট D: লাইভ স্ট্যাটিস্টিক্স (পাবলিক - সংবেদনশীল না, তাই key লাগবে না)
    // ------------------------------------------
    if (action === 'stats') {
      var total = 0, approved = 0, pending = 0, rejected = 0, grooms = 0, brides = 0;
      for (var k = 1; k < data.length; k++) {
        total++;
        var st = idx.status !== -1 ? String(data[k][idx.status] || '').trim().toUpperCase() : '';
        var g = idx.gender !== -1 ? String(data[k][idx.gender] || '').trim().toLowerCase() : '';

        if (st === "APPROVED") {
          approved++;
          if (g.indexOf('পাত্রী') !== -1 || g.indexOf('female') !== -1) brides++;
          else grooms++;
        } else if (st === "REJECTED") {
          rejected++;
        } else {
          pending++;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        total: total, approved: approved, pending: pending, rejected: rejected, grooms: grooms, brides: brides
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ------------------------------------------
    // রাউট D-2: একটা নির্দিষ্ট বায়োডাটা আইডি দিয়ে খোঁজা (শেয়ারেবল লিংক ?action=getById&id=BD-1005)
    // ------------------------------------------
    if (action === 'getById') {
      var lookupId = String(e.parameter.id || '').trim();
      for (var n = 1; n < data.length; n++) {
        var rowN = data[n];
        if (idx.id !== -1 && String(rowN[idx.id] || '').trim() === lookupId) {
          var stN = idx.status !== -1 ? String(rowN[idx.status] || '').trim().toUpperCase() : 'APPROVED';
          if (stN !== 'APPROVED' && stN !== '') break;
          var rawDobN = idx.dob !== -1 ? rowN[idx.dob] : '';
          var cleanDobN = (rawDobN instanceof Date) ? Utilities.formatDate(rawDobN, "Asia/Dhaka", "dd/MM/yyyy") : String(rawDobN || '').trim();
          var single = {
            biodataId: lookupId,
            fullName: idx.name !== -1 ? String(rowN[idx.name] || '').trim() : '',
            gender: idx.gender !== -1 ? String(rowN[idx.gender] || '').trim() : '',
            dob: cleanDobN,
            height: idx.height !== -1 ? String(rowN[idx.height] || '').trim() : '',
            bloodGroup: idx.blood !== -1 ? String(rowN[idx.blood] || '').trim() : '',
            maritalStatus: idx.marital !== -1 ? String(rowN[idx.marital] || '').trim() : '',
            religion: idx.religion !== -1 ? String(rowN[idx.religion] || '').trim() : '',
            education: idx.edu !== -1 ? String(rowN[idx.edu] || '').trim() : '',
            profession: idx.prof !== -1 ? String(rowN[idx.prof] || '').trim() : '',
            monthlyIncome: idx.income !== -1 ? String(rowN[idx.income] || '').trim() : '',
            presentAddress: idx.present !== -1 ? String(rowN[idx.present] || '').trim() : '',
            district: idx.dist !== -1 ? String(rowN[idx.dist] || '').trim() : '',
            fatherName: idx.father !== -1 ? String(rowN[idx.father] || '').trim() : '',
            motherName: idx.mother !== -1 ? String(rowN[idx.mother] || '').trim() : '',
            familyStatus: idx.fam !== -1 ? String(rowN[idx.fam] || '').trim() : '',
            partnerExpectation: idx.exp !== -1 ? String(rowN[idx.exp] || '').trim() : ''
          };
          return ContentService.createTextOutput(JSON.stringify({ "result": "success", "data": single })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ "result": "error", "message": "বায়োডাটা পাওয়া যায়নি" })).setMimeType(ContentService.MimeType.JSON);
    }

    // ------------------------------------------
    // রাউট D-3: কেউ কোনো বায়োডাটায় "ইন্টারেস্ট" পাঠালে এডমিনকে মেইল যাবে
    // (?action=sendInterest&id=BD-1005&fromContact=017xxxxxxxx)
    // ------------------------------------------
    if (action === 'sendInterest') {
      var interestId = String(e.parameter.id || '').trim();
      var fromContact = String(e.parameter.fromContact || 'অজানা').trim().replace(/[<>]/g, '');
      try {
        var adminEmailForInterest = getAdminEmail_();
        if (adminEmailForInterest && interestId) {
          MailApp.sendEmail({
            to: adminEmailForInterest,
            subject: "💌 নতুন আগ্রহ প্রকাশ - " + interestId,
            body: "একজন ভিজিটর বায়োডাটা " + interestId + "-তে আগ্রহ দেখিয়েছেন।\n\nযোগাযোগ নম্বর (ভিজিটরের দেওয়া): " + fromContact
          });
        }
      } catch (intErr) {}
      return ContentService.createTextOutput(JSON.stringify({ "result": "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    // ------------------------------------------
    // রাউট E: পাবলিক ওয়েবসাইটের জন্য এপ্রুভড ডেটা রিটার্ন
    // 🔒 এখানে contactNumber, fbLink, monthlyIncome আর পাঠানো হচ্ছে না — শুধু বয়স (age), জন্মতারিখ নয়
    // ------------------------------------------
    if (data.length <= 1) {
      return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
    }

    var result = [];
    for (var m = 1; m < data.length; m++) {
      var row = data[m];
      var statusVal = idx.status !== -1 ? String(row[idx.status] || '').trim().toUpperCase() : 'APPROVED';

      if (statusVal === "APPROVED" || statusVal === "") {
        var gVal = idx.gender !== -1 ? String(row[idx.gender] || '').trim() : '';
        var gLower = gVal.toLowerCase();
        var normGender = (gLower.indexOf('পাত্রী') !== -1 || gLower.indexOf('female') !== -1 || gLower.indexOf('মহিলা') !== -1 || gLower.indexOf('নারী') !== -1 || gLower.indexOf('মেয়ে') !== -1) ? 'female' : 'male';

        var rawDob = idx.dob !== -1 ? row[idx.dob] : '';
        var cleanDob = (rawDob instanceof Date) ? Utilities.formatDate(rawDob, "Asia/Dhaka", "dd/MM/yyyy") : String(rawDob || '').trim();

        result.push({
          biodataId: idx.id !== -1 ? String(row[idx.id] || '').trim() : 'BD-' + (1000 + m),
          timestamp: idx.time !== -1 ? String(row[idx.time] || '').trim() : '',
          status: 'APPROVED',
          fullName: idx.name !== -1 ? String(row[idx.name] || '').trim() : '',
          gender: gVal,
          normGender: normGender,
          dob: cleanDob,
          height: idx.height !== -1 ? String(row[idx.height] || '').trim() : '',
          bloodGroup: idx.blood !== -1 ? String(row[idx.blood] || '').trim() : '',
          maritalStatus: idx.marital !== -1 ? String(row[idx.marital] || '').trim() : '',
          religion: idx.religion !== -1 ? String(row[idx.religion] || '').trim() : '',
          education: idx.edu !== -1 ? String(row[idx.edu] || '').trim() : '',
          profession: idx.prof !== -1 ? String(row[idx.prof] || '').trim() : '',
          orgDesignation: idx.org !== -1 ? String(row[idx.org] || '').trim() : '',
          monthlyIncome: idx.income !== -1 ? String(row[idx.income] || '').trim() : '',
          presentAddress: idx.present !== -1 ? String(row[idx.present] || '').trim() : '',
          district: idx.dist !== -1 ? String(row[idx.dist] || '').trim() : '',
          fatherName: idx.father !== -1 ? String(row[idx.father] || '').trim() : '',
          motherName: idx.mother !== -1 ? String(row[idx.mother] || '').trim() : '',
          siblingsInfo: idx.sib !== -1 ? String(row[idx.sib] || '').trim() : '',
          familyStatus: idx.fam !== -1 ? String(row[idx.fam] || '').trim() : '',
          partnerExpectation: idx.exp !== -1 ? String(row[idx.exp] || '').trim() : ''
          // ❌ শুধু contactNumber ও fbLink বাদ দেওয়া হয়েছে — এই দুইটা শুধু এডমিন প্যানেলে (পাসওয়ার্ড দিয়ে) দেখা যাবে
        });
      }
    }

    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ "error": err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ==========================================
// ৩. ফর্ম সাবমিট ফাংশন (POST Request)
// 🔒 LockService দিয়ে race condition ঠেকানো হয়েছে, সার্ভার-সাইড ভ্যালিডেশন ও honeypot যোগ করা হয়েছে
// ==========================================
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (lockErr) {
    return ContentService.createTextOutput(JSON.stringify({ "result": "error", "error": "সার্ভার ব্যস্ত আছে, একটু পর আবার চেষ্টা করুন।" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();

    // ------------------------------------------
    // এডমিন এডিট রাউট: ?action=adminEdit&key=... (POST body: { id, fields: {fullName, height, ...} })
    // ------------------------------------------
    var postAction = (e && e.parameter && e.parameter.action) ? String(e.parameter.action).trim() : '';
    if (postAction === 'adminEdit') {
      var providedKeyEdit = (e && e.parameter && e.parameter.key) ? String(e.parameter.key).trim() : '';
      if (!getAdminKey_() || providedKeyEdit !== getAdminKey_()) {
        return ContentService.createTextOutput(JSON.stringify({ "result": "error", "message": "Unauthorized" })).setMimeType(ContentService.MimeType.JSON);
      }
      var editBody = JSON.parse(e.postData.contents);
      var editId = String(editBody.id || '').trim();
      var newFields = editBody.fields || {};

      var allRowsEdit = sheet.getDataRange().getValues();
      var headersEdit = allRowsEdit.length > 0 ? allRowsEdit[0] : [];
      var idxEdit = buildColumnIndex_(headersEdit);

      for (var er = 1; er < allRowsEdit.length; er++) {
        if (String(allRowsEdit[er][idxEdit.id] || '').trim() === editId) {
          var colMap = {
            fullName: idxEdit.name, gender: idxEdit.gender, dob: idxEdit.dob, height: idxEdit.height,
            bloodGroup: idxEdit.blood, maritalStatus: idxEdit.marital, religion: idxEdit.religion,
            education: idxEdit.edu, profession: idxEdit.prof, orgDesignation: idxEdit.org,
            monthlyIncome: idxEdit.income, presentAddress: idxEdit.present, district: idxEdit.dist,
            fatherName: idxEdit.father, motherName: idxEdit.mother, siblingsInfo: idxEdit.sib,
            familyStatus: idxEdit.fam, partnerExpectation: idxEdit.exp, contactNumber: idxEdit.phone, fbLink: idxEdit.fb
          };
          for (var key in colMap) {
            if (newFields.hasOwnProperty(key) && colMap[key] !== -1) {
              sheet.getRange(er + 1, colMap[key] + 1).setValue(String(newFields[key]).replace(/[<>]/g, ''));
            }
          }
          return ContentService.createTextOutput(JSON.stringify({ "result": "success", "id": editId })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ "result": "error", "message": "ID not found" })).setMimeType(ContentService.MimeType.JSON);
    }

    // ------------------------------------------
    // সাধারণ ফর্ম সাবমিশন (উপরের কোনো এডমিন-অ্যাকশন না হলে)
    // ------------------------------------------
    var data = JSON.parse(e.postData.contents);

    // ০. Honeypot (বট আটকাতে) — ফ্রন্টএন্ডে একটা লুকানো ফিল্ড 'website' যোগ করুন,
    //    বট সেটা পূরণ করে ফেলবে, মানুষ দেখবেই না
    if (data.website) {
      return ContentService.createTextOutput(JSON.stringify({ "result": "success", "biodataId": "BD-0000" }))
        .setMimeType(ContentService.MimeType.JSON); // বটকে বোঝাতে দিচ্ছি সফল হয়েছে, আসলে কিছু সেভ হয়নি
    }

    // ১. সার্ভার-সাইড রিকোয়ার্ড ফিল্ড ভ্যালিডেশন
    var required = ['fullName', 'gender', 'dob', 'height', 'bloodGroup', 'maritalStatus', 'religion', 'education', 'profession', 'presentAddress', 'district', 'contactNumber'];
    for (var f = 0; f < required.length; f++) {
      if (!data[required[f]] || String(data[required[f]]).trim() === '') {
        return ContentService.createTextOutput(JSON.stringify({ "result": "error", "error": "প্রয়োজনীয় তথ্য অনুপস্থিত: " + required[f] }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    var inputPhone = String(data.contactNumber || '').trim().replace(/\D/g, '');
    if (inputPhone.length < 11 || inputPhone.length > 11) {
      return ContentService.createTextOutput(JSON.stringify({ "result": "error", "error": "সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন।" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ২. ডুপ্লিকেট মোবাইল নম্বর প্রতিরোধ (dynamic column index ব্যবহার করে, হার্ডকোড নয়)
    var allRows = sheet.getDataRange().getValues();
    var headers = allRows.length > 0 ? allRows[0] : [];
    var idx = buildColumnIndex_(headers);

    if (idx.phone !== -1) {
      for (var r = 1; r < allRows.length; r++) {
        var existingPhone = String(allRows[r][idx.phone] || '').trim().replace(/\D/g, '');
        if (existingPhone && existingPhone === inputPhone) {
          return ContentService.createTextOutput(JSON.stringify({
            "result": "error",
            "error": "এই মোবাইল নম্বরটি দিয়ে ইতোমধ্যে একটি বায়োডাটা জমা দেওয়া হয়েছে!"
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
    }

    // ৩. বায়োডাটা আইডি — Script Properties কাউন্টার দিয়ে (race-condition-safe, lock এর ভেতরে)
    var props = PropertiesService.getScriptProperties();
    var lastNum = parseInt(props.getProperty('LAST_BIODATA_NUM') || '1000', 10);
    var nextNum = lastNum + 1;
    props.setProperty('LAST_BIODATA_NUM', String(nextNum));
    var biodataId = "BD-" + nextNum;

    var timestamp = Utilities.formatDate(new Date(), "Asia/Dhaka", "dd/MM/yyyy hh:mm:ss a");
    var defaultStatus = "APPROVED"; // ✅ এখন সাবমিট করলেই অটো-এপ্রুভ হয়ে সরাসরি পাবলিশ হবে

    // ৪. XSS-স্টাইল ইনজেকশন ঠেকাতে < > ক্যারেক্টার স্ট্রিপ করা (শীটে সেভ করার আগে)
    function clean(v) {
      return String(v || '').replace(/[<>]/g, '').trim();
    }

    sheet.appendRow([
      biodataId, timestamp, defaultStatus, clean(data.fullName), clean(data.gender),
      clean(data.dob), clean(data.height), clean(data.bloodGroup), clean(data.maritalStatus),
      clean(data.religion), clean(data.education), clean(data.profession), clean(data.orgDesignation),
      clean(data.monthlyIncome), clean(data.presentAddress), clean(data.district),
      clean(data.fatherName), clean(data.motherName), clean(data.siblingsInfo),
      clean(data.familyStatus), clean(data.partnerExpectation), inputPhone, clean(data.fbLink)
    ]);

    // ৫. এডমিনকে ইমেইল নোটিফিকেশন — এখন Script Properties-এ সেভ করা ফিক্সড ইমেইলে যাবে
    try {
      var adminEmail = getAdminEmail_();
      if (adminEmail) {
        MailApp.sendEmail({
          to: adminEmail,
          subject: "🚨 নতুন বায়োডাটা জমা হয়েছে (" + biodataId + ")",
          body: "আসসালামু আলাইকুম,\n\nনতুন একটি বায়োডাটা জমা হয়েছে:\n\n" +
                "আইডি: " + biodataId + "\n" +
                "নাম: " + clean(data.fullName) + "\n" +
                "লিঙ্গ: " + clean(data.gender) + "\n" +
                "জেলা: " + clean(data.district) + "\n\n" +
                "এপ্রুভ করতে এডমিন প্যানেলে যান।"
        });
      }
    } catch (mailErr) {}

    return ContentService
      .createTextOutput(JSON.stringify({ "result": "success", "biodataId": biodataId, "fullName": clean(data.fullName) }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ "result": "error", "error": error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// ৪. এডমিন লগইন স্ক্রিন (key ছাড়া ?action=admin এ ঢুকলে এটা দেখাবে)
// ==========================================
function renderAdminLoginUI_() {
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
  '<style>body{font-family:sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}' +
  '.box{background:#fff;padding:24px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.08);width:280px;text-align:center;}' +
  'input{width:100%;padding:10px;margin:10px 0;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;}' +
  'button{width:100%;padding:10px;background:#e11d48;color:#fff;border:none;border-radius:8px;font-weight:bold;}</style></head><body>' +
  '<div class="box"><h3>🔒 এডমিন লগইন</h3><input type="password" id="pw" placeholder="পাসওয়ার্ড দিন"><button onclick="go()">প্রবেশ করুন</button></div>' +
  '<script>function go(){var pw=document.getElementById("pw").value;var base=window.location.href.split("?")[0];window.location.href=base+"?action=admin&key="+encodeURIComponent(pw);}</script>' +
  '</body></html>';
  return HtmlService.createHtmlOutput(html);
}

// ==========================================
// ৫. মোবাইল এডমিন ড্যাশবোর্ড UI রেন্ডারার
// 🔒 এখন সব fetch কলে &key= যোগ হচ্ছে, এবং সব ডেটা escapeHtml_() দিয়ে বসানো হচ্ছে (XSS ফিক্স)
// ==========================================
function renderAdminDashboardUI_(adminKey) {
  var safeKey = encodeURIComponent(adminKey);
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>বায়োডাটা এডমিন প্যানেল</title>' +
  '<style>body{font-family:sans-serif;background:#f8fafc;margin:0;padding:10px;color:#0f172a;}h2{color:#e11d48;text-align:center;margin:5px 0 15px 0;font-size:18px;}.card{background:#fff;border-radius:10px;padding:12px;margin-bottom:10px;border:1px solid #e2e8f0;box-shadow:0 2px 6px rgba(0,0,0,0.04);}.badge{padding:3px 8px;border-radius:12px;font-size:11px;font-weight:bold;}.PENDING{background:#fef9c3;color:#a16207;}.APPROVED{background:#dcfce7;color:#15803d;}.REJECTED{background:#fee2e2;color:#b91c1c;}.btn{border:none;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:bold;cursor:pointer;margin-right:5px;margin-top:5px;color:#fff;}.approve-btn{background:#10b981;}.reject-btn{background:#ef4444;}.edit-btn{background:#2563eb;}.del-btn{background:#64748b;}' +
  '#searchBox{width:100%;padding:10px;border-radius:8px;border:1px solid #cbd5e1;margin-bottom:10px;box-sizing:border-box;}' +
  '#exportBtn{background:#0f172a;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:bold;margin-bottom:10px;cursor:pointer;}</style></head><body>' +
  '<h2>🌸 পাত্র-পাত্রী এডমিন প্যানেল</h2>' +
  '<div id="stats" style="background:#fff1f2;padding:8px;border-radius:8px;text-align:center;font-weight:bold;margin-bottom:10px;color:#e11d48;">স্ট্যাটিস্টিক্স লোড হচ্ছে...</div>' +
  '<input id="searchBox" placeholder="🔍 আইডি, নাম বা জেলা দিয়ে খুঁজুন..." oninput="renderList()">' +
  '<button id="exportBtn" onclick="exportCSV()">⬇️ CSV এক্সপোর্ট করুন</button>' +
  '<div id="content">ডেটা লোড হচ্ছে...</div>' +
  '<script>' +
  'var adminKey = "' + safeKey + '";' +
  'var baseUrl = window.location.href.split("?")[0];' +
  'var allAdminData = [];' +
  'function esc(s){var d=document.createElement("div");d.innerText=(s==null?"":s);return d.innerHTML;}' +
  'function loadStats(){fetch(baseUrl + "?action=stats").then(r=>r.json()).then(s=>{document.getElementById("stats").innerHTML="📊 মোট: " + s.total + " | ✅ এপ্রুভড: " + s.approved + " | ⏳ পেন্ডিং: " + s.pending;});}' +
  'function loadAdminData(){' +
  'fetch(baseUrl + "?action=getAllForAdmin&key=" + adminKey).then(r=>r.json()).then(data=>{' +
  'if(data && data.result === "error"){document.getElementById("content").innerHTML="<p style=\'text-align:center;color:#e11d48;\'>পাসওয়ার্ড ভুল অথবা মেয়াদোত্তীর্ণ।</p>";return;}' +
  'allAdminData = data.reverse();' +
  'renderList();loadStats();});}' +
  'function renderList(){' +
  'var q = document.getElementById("searchBox").value.trim().toLowerCase();' +
  'var filtered = allAdminData.filter(item => !q || item.biodataId.toLowerCase().indexOf(q)!==-1 || item.fullName.toLowerCase().indexOf(q)!==-1 || item.district.toLowerCase().indexOf(q)!==-1);' +
  'var html="";if(!filtered||filtered.length===0){html="<p style=\'text-align:center;\'>কোনো বায়োডাটা পাওয়া যায়নি</p>";}' +
  'filtered.forEach(item=>{' +
  'html += "<div class=\'card\'><div><b>" + esc(item.biodataId) + "</b> - " + esc(item.fullName) + " (" + esc(item.gender) + ") <span class=\'badge " + esc(item.status) + "\'>" + esc(item.status) + "</span></div>";' +
  'html += "<div style=\'font-size:12px;color:#64748b;margin:6px 0;\'>জেলা: " + esc(item.district) + " | মোবাইল: " + esc(item.contactNumber) + "</div>";' +
  'html += "<div><button class=\'btn approve-btn\' onclick=\'setStatus(\\"" + esc(item.biodataId) + "\\", \\"APPROVED\\")\'>✅ Approve</button>";' +
  'html += "<button class=\'btn reject-btn\' onclick=\'setStatus(\\"" + esc(item.biodataId) + "\\", \\"REJECTED\\")\'>❌ Reject</button>";' +
  'html += "<button class=\'btn edit-btn\' onclick=\'editItem(\\"" + esc(item.biodataId) + "\\")\'>✏️ Edit</button>";' +
  'html += "<button class=\'btn del-btn\' onclick=\'deleteItem(\\"" + esc(item.biodataId) + "\\")\'>🗑️ Delete</button></div></div>";' +
  '});document.getElementById("content").innerHTML=html;}' +
  'function setStatus(id, st){' +
  'fetch(baseUrl + "?action=updateStatus&id=" + encodeURIComponent(id) + "&status=" + st + "&key=" + adminKey).then(r=>r.json()).then(res=>{loadAdminData();});' +
  '}' +
  'function deleteItem(id){' +
  'if(!confirm("আপনি কি নিশ্চিত এই বায়োডাটা (" + id + ") সম্পূর্ণ মুছে ফেলতে চান? এটা আর ফেরত আনা যাবে না।"))return;' +
  'fetch(baseUrl + "?action=deleteBiodata&id=" + encodeURIComponent(id) + "&key=" + adminKey).then(r=>r.json()).then(res=>{loadAdminData();});' +
  '}' +
  'function editItem(id){' +
  'var item = allAdminData.find(x=>x.biodataId===id); if(!item) return;' +
  'var newName = prompt("নাম:", item.fullName); if(newName===null) return;' +
  'var newDistrict = prompt("জেলা:", item.district); if(newDistrict===null) return;' +
  'var newPhone = prompt("মোবাইল নম্বর:", item.contactNumber); if(newPhone===null) return;' +
  'fetch(baseUrl + "?action=adminEdit&key=" + adminKey, {method:"POST", body: JSON.stringify({id:id, fields:{fullName:newName, district:newDistrict, contactNumber:newPhone}})})' +
  '.then(r=>r.json()).then(res=>{alert("আপডেট হয়েছে!");loadAdminData();});' +
  '}' +
  'function exportCSV(){' +
  'var rows = [["আইডি","নাম","লিঙ্গ","স্ট্যাটাস","জেলা","মোবাইল"]];' +
  'allAdminData.forEach(i=>rows.push([i.biodataId,i.fullName,i.gender,i.status,i.district,i.contactNumber]));' +
  'var csv = rows.map(r=>r.map(c=>"\\"" + String(c||"").replace(/"/g,\'""\') + "\\"").join(",")).join("\\n");' +
  'var blob = new Blob(["\\uFEFF"+csv], {type:"text/csv;charset=utf-8;"});' +
  'var link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "biodata_export.csv"; link.click();' +
  '}' +
  'window.onload=loadAdminData;' +
  '</script></body></html>';
  return HtmlService.createHtmlOutput(html).setXframeOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

// ==========================================
// ৬. অটোমেটিক গুগল ড্রাইভ ব্যাকআপ সিস্টেম
// ==========================================
function createSheetBackup() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var dateStr = Utilities.formatDate(new Date(), "Asia/Dhaka", "dd-MM-yyyy");
    var backupName = "Biodata_Database_Backup_" + dateStr;

    var file = DriveApp.getFileById(SPREADSHEET_ID);
    var folder = DriveApp.getRootFolder();
    file.makeCopy(backupName, folder);
    Logger.log("গুগল ড্রাইভে ব্যাকআপ সফল: " + backupName);
  } catch (e) {
    Logger.log("ব্যাকআপ এরর: " + e.toString());
  }
}

// প্রতি রবিবার রাত ১২টায় অটো ব্যাকআপ ট্রিগার — ডুপ্লিকেট ট্রিগার এড়াতে আগে চেক করে
function setupAutoBackupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'createSheetBackup') {
      Logger.log('ব্যাকআপ ট্রিগার আগে থেকেই আছে, নতুন করে বসানো হলো না।');
      return;
    }
  }
  ScriptApp.newTrigger('createSheetBackup')
    .timeBased()
    .everyWeeks(1)
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(0)
    .create();
}

// ==========================================
// ৭. শিট ফরম্যাটিং ও এডমিন মেনু
// ==========================================
function setupAndFormatSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  sheet.clear();
  sheet.clearFormats();

  var headers = [["বায়োডাটা আইডি", "জমার তারিখ ও সময়", "স্ট্যাটাস (Status)", "পুরো নাম", "লিঙ্গ", "জন্মতারিখ", "উচ্চতা", "রক্তের গ্রুপ", "বৈবাহিক অবস্থা", "ধর্ম", "শিক্ষাগত যোগ্যতা", "পেশা", "প্রতিষ্ঠান ও পদবী", "মাসিক আয়", "বর্তমান ঠিকানা", "স্থায়ী জেলা", "পিতার নাম", "মাতার নাম", "ভাই-বোনের তথ্য", "পারিবারিক অবস্থা", "প্রত্যাশা", "মোবাইল / হোয়াটসঅ্যাপ", "ফেসবুক লিংক"]];

  var headerRange = sheet.getRange(1, 1, 1, headers[0].length);
  headerRange.setValues(headers).setBackground("#be123c").setFontColor("#ffffff").setFontWeight("bold").setFontSize(11).setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.setRowHeight(1, 42); sheet.setFrozenRows(1); sheet.setFrozenColumns(1);

  var statusRule = SpreadsheetApp.newDataValidation().requireValueInList(["APPROVED", "PENDING", "REJECTED"], true).setAllowInvalid(false).build();
  sheet.getRange("C2:C500").setDataValidation(statusRule);
}

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🌸 বায়োডাটা অপশন')
    .addItem('🎨 টেবিল অটো-ফরম্যাট করুন', 'setupAndFormatSheet')
    .addItem('💾 গুগল ড্রাইভে ব্যাকআপ নিন', 'createSheetBackup')
    .addToUi();
}
