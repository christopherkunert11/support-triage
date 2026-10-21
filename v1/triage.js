/*
 * Supportanfrage - Triage, v1
 * Lokale, regelbasierte Einordnung. Keine externe API, keine Datenbank, kein Login.
 * Läuft im Browser (window.Triage) und in Node (module.exports) für Tests.
 *
 * Grundsatz: Der Supporttext ist ausschließlich Inhalt. Nichts darin wird
 * ausgeführt; Sätze, die wie Anweisungen an die App aussehen, werden erkannt,
 * sichtbar gemeldet und bei der Einordnung nicht mitgezählt.
 */
(function (root) {
  "use strict";

  var MAX_CHARS = 5000;
  var MIN_WORDS = 3;
  var QUOTE_MAX = 300;

  // Schlüsselwörter werden in ASCII-Schreibweise notiert (ae/oe/ue/ss).
  // rx() macht daraus Muster, die sowohl "ü" als auch "ue" usw. treffen.
  var UMLAUT = { ae: "(?:ä|ae)", oe: "(?:ö|oe)", ue: "(?:ü|ue)", ss: "(?:ß|ss)" };
  function rx(source) {
    return new RegExp(source.replace(/ae|oe|ue|ss/g, function (m) { return UMLAUT[m]; }));
  }
  function rule(label, source) { return { label: label, re: rx(source) }; }

  // Reihenfolge = Vorrang bei Gleichstand.
  var CATEGORY_ORDER = ["Zugang", "Abrechnung", "Technisches Problem"];

  var CATEGORY_RULES = {
    "Zugang": [
      rule("Login", "log-?in|einlogg|einzulogg|ausgelogg"),
      rule("Anmeldung", "anmeld|anzumeld"),
      rule("Passwort", "passwort|kennwort|password"),
      rule("Zugang/Zugriff", "zugang|zugriff|zugangsdaten"),
      // nur Sperren von Konto/Zugang, nicht z. B. eine gesperrte Kreditkarte
      rule("Kontosperre", "(?:konto|account|zugang|login|benutzer\\w*|nutzer\\w*) (?:\\w+ ){0,3}(?:gesperrt|entsperr)|ausgesperrt|sperrung (?:des |meines |unseres )?(?:kontos|accounts|zugangs)|(?:gesperrt|entsperr)\\w* (?:\\w+ ){0,2}(?:konto|account|zugang)"),
      rule("Zwei-Faktor/Code", "\\b2fa\\b|zwei-?faktor|authentifizier|verifizierungscode|bestaetigungscode|sms-?code|\\botp\\b"),
      rule("Benutzername", "benutzername|nutzername|benutzerkonto|nutzerkonto"),
      rule("Registrierung/Freischaltung", "registrier|freischalt|aktivierungs"),
      rule("Berechtigung", "berechtigung"),
      rule("Konto übernommen", "gehackt|hacker|phishing|kompromittiert")
    ],
    "Abrechnung": [
      rule("Rechnung", "(?<!be)rechnung"),
      rule("Zahlung", "zahlung|bezahl|gezahlt"),
      rule("Abbuchung", "abbuch|abgebucht|lastschrift"),
      rule("Gebühr/Kosten/Preis", "gebuehr|kosten|preis"),
      rule("Erstattung/Gutschrift", "erstatt|gutschrift|geld zurueck"),
      rule("Mahnung/Inkasso", "mahnung|mahnbescheid|inkasso|zahlungserinnerung"),
      rule("Zahlungsmittel", "kreditkarte|paypal|ueberweis|\\biban\\b|\\bsepa\\b"),
      rule("Betrag", "\\d+(?:[.,]\\d{1,2})?\\s?(?:€|euro\\b|eur\\b)|€"),
      rule("Abo/Tarif/Vertrag", "\\babos?\\b|abonnement|tarif|kuendig|vertrag")
    ],
    "Technisches Problem": [
      rule("Fehler", "fehler|\\berror"),
      rule("Absturz", "absturz|stuerzt|abgestuerzt|\\bcrash"),
      rule("Funktioniert nicht", "funktioniert (?:\\w+ )?nicht|geht (?:\\w+ )?nicht|klappt (?:\\w+ )?nicht"),
      rule("Laden/Leistung", "laedt (?:\\w+ )?nicht|ladezeit|langsam|haengt|friert|eingefroren"),
      rule("Bug/leere Seite", "\\bbugs?\\b|weisse seite|leere seite|timeout|zeitueberschreitung"),
      rule("HTTP-Fehlercode", "\\b(?:500|502|503|504|404|403)\\b"),
      rule("Server/Verbindung", "server|verbindung|offline|synchronis|\\bdown\\b"),
      rule("Update/Installation", "\\bupdates?\\b|installation|installier"),
      rule("Upload/Download/Export", "upload|hochladen|hochzuladen|download|herunterladen|export|import"),
      rule("App/Browser", "\\bapps?\\b|browser")
    ],
    "Sonstiges": [
      rule("Adresse/Daten ändern", "adresse|anschrift|aendern"),
      rule("Frage/Auskunft", "frage|information|auskunft|wissen"),
      rule("Feedback", "feedback|vorschlag|anregung|\\blob\\b|beschwerde|zufrieden"),
      rule("Datenschutz", "datenschutz|dsgvo|daten loeschen|auskunftsersuchen"),
      rule("Newsletter/Kontakt", "newsletter|kontakt|rueckruf|termin"),
      rule("Lieferung/Bestellung", "lieferung|geliefert|versand|paket|retoure|rueckgabe|umtausch|bestellung|bestellt")
    ]
  };

  // Hinweise auf ein Problem (führt mindestens zu "mittel").
  var PROBLEM_RULES = [
    rule("„nicht mehr“", "nicht mehr"),
    rule("funktioniert/geht nicht", "funktioniert (?:\\w+ )?nicht|geht (?:\\w+ )?nicht|klappt (?:\\w+ )?nicht|laedt (?:\\w+ )?nicht"),
    rule("kann nicht", "kann (?:mich |ich |es )?(?:\\w+ )?nicht|koennen (?:\\w+ )?nicht"),
    rule("kein Zugriff", "keinen? (?:zugriff|zugang)"),
    rule("Fehler", "fehler|\\berror|fehlgeschlagen|abgelehnt"),
    rule("falsch/doppelt", "falsch|doppelt|zu viel|zuviel"),
    rule("Problem/Störung", "problem|stoerung|defekt|kaputt"),
    rule("gesperrt", "gesperrt|ausgesperrt"),
    rule("vergessen", "vergessen"),
    rule("nicht erhalten", "nicht (?:angekommen|erhalten|bekommen)"),
    rule("Beschwerde", "beschwerde|reklamation"),
    rule("Absturz", "absturz|stuerzt|abgestuerzt|\\bcrash|haengt|friert")
  ];

  // "hoch" NUR bei diesen drei Gründen. Wörter wie "dringend" oder "sofort"
  // allein reichen ausdrücklich nicht.
  var HIGH_RULES = [
    { type: "blockade", label: "komplette Blockade", re: rx(
      "gar nicht mehr|ueberhaupt nicht mehr|komplett (?:gesperrt|ausgesperrt|ausgefallen|down|blockiert|weg)|" +
      "totalausfall|komplettausfall|nichts (?:geht|funktioniert) mehr|steht (?:komplett |voellig )?still|" +
      "kann (?:gar |ueberhaupt )?nicht mehr arbeiten|koennen (?:gar |ueberhaupt )?nicht mehr arbeiten|" +
      "niemand (?:von uns )?kann|keiner (?:von uns )?kann|alle (?:mitarbeiter|mitarbeitenden|nutzer|kollegen|kunden)\\w* (?:koennen|sind|haben)|" +
      "keinen (?:zugriff|zugang) mehr|ausgesperrt|\\bdown\\b") },
    { type: "sicherheit", label: "Sicherheitsrisiko", re: rx(
      "gehackt|hacker|\\bhack|unbefugt|unberechtigte?r? zugriff|fremde?r? (?:person|zugriff)|phishing|" +
      "datenleck|datenpanne|sicherheitsluecke|sicherheitsproblem|sicherheitsrisiko|kompromittiert|" +
      "malware|\\bvirus|trojaner|(?:passwort|zugangsdaten) (?:wurde |wurden )?(?:gestohlen|geklaut)|" +
      "jemand (?:anderes |fremdes )?hat sich (?:in mein|bei mir|mit meinem)|" +
      "daten (?:anderer|fremder) (?:kunden|nutzer|personen)|fremde daten|identitaetsdiebstahl") },
    { type: "finanziell", label: "unmittelbar drohender finanzieller Schaden", re: rx(
      "inkasso|pfaendung|letzte mahnung|mahnbescheid|gerichtlich|" +
      "unberechtigte? (?:abbuchung|abgebucht|belastung)|nicht autorisiert|\\bbetrug\\b(?!\\s+(?:\\w+\\s+)?\\d)|betrugs|betrueger|" +
      "konto (?:ist )?(?:ueberzogen|im minus)|ruecklastschrift|" +
      "frist (?:laeuft|endet) (?:heute|morgen|in \\d+ stunden)|" +
      "(?:\\bheute|\\bmorgen|in \\d+ stunden) (?:\\w+ ){0,3}(?:abgebucht|eingezogen|verlaengert|belastet)|" +
      "(?:abgebucht|eingezogen|verlaengert|belastet) (?:\\w+ ){0,3}(?:heute|morgen)\\b") }
  ];

  // Sätze, die sich an die App richten statt ein Anliegen zu beschreiben.
  var INJECTION_RE = rx(
    "ignorier\\w* (?:\\w+ ){0,4}(?:regeln|anweisungen|instruktionen|vorgaben|prompts?|obige|vorherige|bisherige)|" +
    "ignore (?:all|any|previous|the|your)|disregard (?:all|previous|the)|forget (?:all|previous|your)|" +
    "vergiss (?:alle|deine|die|bisherige)|missachte|regeln? (?:gelten nicht|ausser kraft|sind aufgehoben)|" +
    "du bist (?:jetzt|ab sofort|nun)|you are now|\\bact as\\b|tu so,? als|system ?prompt|^\\s*(?:system|assistant|developer)\\s*:|" +
    "setze? (?:die |den )?(?:dringlichkeit|kategorie|prioritaet|status)|" +
    "(?:dringlichkeit|prioritaet|kategorie|urgency|priority)\\s*(?:ist|=|:|auf|is|to)\\s*(?:hoch|high|mittel|niedrig|low|zugang|abrechnung|sonstiges|technisch)|" +
    "stufe (?:\\w+ ){0,3}als (?:hoch|dringend|niedrig)|als (?:hoch|dringend|kritisch) (?:einstufen|einordnen|markieren|kennzeichnen)|" +
    "neue (?:regel|anweisung)|developer mode|jailbreak"
  );

  var NEGATION_RE = /(?:^|[^a-zäöüß])(?:kein\w*|nicht|nie|niemals|ohne)\s+(?:\S+\s+){0,2}$/;
  var HYPOTHETICAL_RE = rx("\\b(?:wenn|falls)\\b|was passiert|was tun");

  var ABBREVIATIONS = ["nr", "z.b", "bzw", "ca", "usw", "ggf", "inkl", "evtl", "d.h", "u.a", "str", "tel", "dr", "vgl", "bspw", "max", "min", "kto", "mfg"];

  // Kleinschreibung, ohne die Länge zu verändern (Positionen bleiben gleich).
  function lower(s) {
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      var l = c.toLowerCase();
      out += l.length === 1 ? l : c;
    }
    return out;
  }

  function countChars(s) { return Array.from(s).length; }

  function countWords(s) {
    var m = s.match(/[0-9A-Za-zÀ-ÖØ-öø-ÿ€]+/g);
    return m ? m.length : 0;
  }

  // Zerlegt den Originaltext in Sätze und merkt sich die genaue Position.
  function splitSentences(text) {
    var out = [];
    var start = 0;
    function push(end) {
      var raw = text.slice(start, end);
      var lead = raw.length - raw.replace(/^\s+/, "").length;
      var trimmed = raw.trim();
      if (trimmed) out.push({ text: trimmed, start: start + lead });
      start = end;
    }
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (c === "\n") { push(i); start = i + 1; continue; }
      if (c === "." || c === "!" || c === "?" || c === "…") {
        var j = i;
        while (j + 1 < text.length && /[.!?…]/.test(text[j + 1])) j++;
        var next = text[j + 1];
        if (next !== undefined && !/\s/.test(next)) { i = j; continue; }
        if (c === ".") {
          var before = lower(text.slice(Math.max(0, i - 6), i)).match(/([a-zäöüß.]+)$/);
          if (before && ABBREVIATIONS.indexOf(before[1].replace(/^\./, "")) !== -1) { i = j; continue; }
          if (/\d$/.test(text.slice(0, i)) && next !== undefined && /\s/.test(next) && /^\s*\d/.test(text.slice(j + 1))) { i = j; continue; }
        }
        push(j + 1);
        i = j;
      }
    }
    push(text.length);
    return out;
  }

  function findHigh(sentenceLower) {
    var hits = [];
    var hypothetical = /\?\s*$/.test(sentenceLower) && HYPOTHETICAL_RE.test(sentenceLower);
    if (hypothetical) return hits;
    HIGH_RULES.forEach(function (r) {
      var m = sentenceLower.match(r.re);
      if (!m) return;
      var prefix = sentenceLower.slice(0, m.index);
      if (NEGATION_RE.test(prefix) && !/nicht|kein/.test(m[0])) return; // "kein Sicherheitsrisiko", "nicht gehackt"
      hits.push({ type: r.type, label: r.label, match: m[0], index: m.index });
    });
    return hits;
  }

  function matchRules(rules, s) {
    var hits = [];
    rules.forEach(function (r) {
      var m = s.match(r.re);
      if (m) hits.push({ label: r.label, match: m[0], index: m.index });
    });
    return hits;
  }

  function buildQuote(sentence, hitIndex) {
    var chars = Array.from(sentence.text);
    if (chars.length <= QUOTE_MAX) {
      return { text: sentence.text, cutStart: false, cutEnd: false };
    }
    var t = sentence.text;
    var from = Math.max(0, (hitIndex || 0) - 100);
    var to = Math.min(t.length, from + QUOTE_MAX);
    if (from > 0) { var sp = t.indexOf(" ", from); if (sp !== -1 && sp < (hitIndex || 0)) from = sp + 1; }
    if (to < t.length) { var sp2 = t.lastIndexOf(" ", to); if (sp2 > from) to = sp2; }
    return { text: t.slice(from, to).trim(), cutStart: from > 0, cutEnd: to < t.length };
  }

  function missingInfo(category, lowerText) {
    var missing = [];
    if (category === "Abrechnung") {
      if (!rx("(?:rechnungs|bestell|kunden|vertrags|auftrags|transaktions|buchungs)-?\\s?(?:nr|nummer|id)|#\\s?\\d{3,}|\\b[a-z]{0,4}-?\\d{5,}\\b").test(lowerText))
        missing.push("Rechnungs-, Bestell- oder Vertragsnummer (nicht in der Anfrage genannt)");
      if (!rx("\\d+(?:[.,]\\d{1,2})?\\s?(?:€|euro|eur)|€\\s?\\d").test(lowerText))
        missing.push("betroffener Betrag (nicht in der Anfrage genannt)");
    }
    if (category === "Zugang") {
      if (!/\S+@\S+\.\S+/.test(lowerText) && !rx("benutzername|nutzername|kundennummer|login-?name").test(lowerText))
        missing.push("betroffener Benutzername oder Login-E-Mail (niemals das Passwort)");
    }
    if (category === "Technisches Problem") {
      if (!rx("fehlermeldung|meldung|error|fehler\\s?(?:code|nr|nummer)?\\s?\\d|\\b(?:500|502|503|504|404|403)\\b|code").test(lowerText))
        missing.push("genauer Wortlaut der Fehlermeldung");
      if (!rx("iphone|android|windows|mac|ios|chrome|firefox|safari|edge|browser|handy|smartphone|tablet|laptop|pc\\b|rechner|version|\\bapp\\b").test(lowerText))
        missing.push("Gerät, Betriebssystem bzw. Browser");
    }
    return missing;
  }

  var STEPS = {
    "Zugang": {
      sicherheit: "Konto sofort absichern: alle aktiven Sitzungen beenden, Passwort-Zurücksetzung auslösen und den Fall an das Sicherheitsteam eskalieren.",
      blockade: "Als Zugangsstörung priorisieren: im Admin-System prüfen, ob das Konto gesperrt oder der Anmeldedienst gestört ist, und dem Kunden innerhalb der nächsten Stunde Rückmeldung geben.",
      finanziell: "An Buchhaltung und Kontoverwaltung eskalieren und prüfen, ob die Sperre mit einer offenen Zahlung zusammenhängt.",
      mittel: "Konto-Status im Admin-System prüfen und dem Kunden einen Link zum Zurücksetzen des Passworts schicken.",
      niedrig: "Frage zur Anmeldung beantworten und auf die Anleitung zum Ändern bzw. Zurücksetzen des Passworts verweisen."
    },
    "Abrechnung": {
      sicherheit: "An Sicherheitsteam und Buchhaltung eskalieren: unberechtigte Buchungen prüfen und das hinterlegte Zahlungsmittel vorläufig nicht weiter belasten.",
      blockade: "Priorisiert an die Buchhaltung geben und prüfen, ob eine offene Zahlung den Dienst sperrt.",
      finanziell: "Sofort an die Buchhaltung eskalieren: betroffene Buchung prüfen und laufende Mahn- bzw. Einzugsschritte vorläufig anhalten lassen.",
      mittel: "Die betroffene Buchung im Abrechnungssystem prüfen und dem Kunden das Ergebnis mit Korrektur oder Erstattung mitteilen.",
      niedrig: "Abrechnungsfrage beantworten (z. B. Rechnungskopie, Zahlungsarten, Tarifinfo)."
    },
    "Technisches Problem": {
      sicherheit: "Sofort an das Sicherheitsteam eskalieren und die betroffene Funktion eingrenzen.",
      blockade: "Als Störung mit hoher Priorität an das Technik-Team (Bereitschaft) eskalieren und das Ausmaß klären: betroffene Nutzer, seit wann.",
      finanziell: "An Technik-Team und Buchhaltung eskalieren: prüfen, ob durch den Fehler Fehlbuchungen entstehen.",
      mittel: "Fehler nachstellen und als Ticket an das Technik-Team geben.",
      niedrig: "Frage beantworten bzw. auf den passenden Hilfeartikel verweisen."
    },
    "Sonstiges": {
      sicherheit: "Sofort an das Sicherheitsteam eskalieren.",
      blockade: "An die Teamleitung eskalieren und das zuständige Fachteam bestimmen.",
      finanziell: "Sofort an die Buchhaltung eskalieren.",
      mittel: "An das zuständige Fachteam weiterleiten und dem Kunden den Eingang bestätigen.",
      niedrig: "Anliegen direkt beantworten oder an das zuständige Team weiterleiten."
    }
  };

  var CLARIFY = "Rückfrage an den Kunden: Was wollten Sie tun, was ist stattdessen passiert, und seit wann?";

  function error(code, message, chars) {
    return { status: "error", code: code, message: message, chars: chars };
  }

  function triage(input) {
    if (typeof input !== "string") return error("invalid", "Die Eingabe konnte nicht gelesen werden.", 0);
    var chars = countChars(input);
    if (input.trim() === "") {
      return error("empty", "Das Textfeld ist leer. Bitte fügen Sie zuerst eine Supportanfrage ein.", chars);
    }
    if (chars > MAX_CHARS) {
      return error("too_long", "Die Anfrage ist zu lang: " + chars.toLocaleString("de-DE") + " von höchstens " +
        MAX_CHARS.toLocaleString("de-DE") + " Zeichen. Bitte kürzen Sie den Text um " +
        (chars - MAX_CHARS).toLocaleString("de-DE") + " Zeichen.", chars);
    }

    var sentences = splitSentences(input).map(function (s) {
      s.lower = lower(s.text);
      s.injection = INJECTION_RE.test(s.lower);
      return s;
    });
    var injections = sentences.filter(function (s) { return s.injection; }).map(function (s) { return s.text; });
    var content = sentences.filter(function (s) { return !s.injection; });

    // Kategorie: je Kategorie zählt jede getroffene Regel einmal.
    var catHits = { "Zugang": [], "Abrechnung": [], "Technisches Problem": [], "Sonstiges": [] };
    var highHits = [];
    var problemHits = [];
    content.forEach(function (s, idx) {
      Object.keys(CATEGORY_RULES).forEach(function (cat) {
        matchRules(CATEGORY_RULES[cat], s.lower).forEach(function (h) {
          h.sentence = idx;
          if (!catHits[cat].some(function (x) { return x.label === h.label; })) catHits[cat].push(h);
          else catHits[cat].push({ label: h.label, match: h.match, index: h.index, sentence: idx, repeat: true });
        });
      });
      findHigh(s.lower).forEach(function (h) { h.sentence = idx; highHits.push(h); });
      matchRules(PROBLEM_RULES, s.lower).forEach(function (h) { h.sentence = idx; problemHits.push(h); });
    });

    function score(cat) { return catHits[cat].filter(function (h) { return !h.repeat; }).length; }
    var scores = {};
    Object.keys(catHits).forEach(function (c) { scores[c] = score(c); });

    var category = "Sonstiges";
    var best = 0;
    CATEGORY_ORDER.forEach(function (c) { if (scores[c] > best) { best = scores[c]; category = c; } });
    var tied = CATEGORY_ORDER.filter(function (c) { return best > 0 && scores[c] === best; });

    // Unklar-Gründe
    var contentText = content.map(function (s) { return s.text; }).join(" ");
    var words = countWords(contentText);
    var anyTopic = Object.keys(scores).some(function (c) { return scores[c] > 0; });
    var unclearReasons = [];
    if (content.length === 0) {
      unclearReasons.push("Der Text besteht nur aus Anweisungen an die App und beschreibt kein Anliegen.");
    } else {
      if (words < MIN_WORDS) unclearReasons.push("Der Text ist zu kurz (" + words + (words === 1 ? " Wort" : " Wörter") + "), um das Anliegen sicher einzuordnen.");
      if (!anyTopic) unclearReasons.push("Kein Thema erkennbar: Es kommt kein Begriff zu Zugang, Abrechnung, Technik oder einem sonstigen Anliegen vor.");
    }

    // Dringlichkeit
    var urgency, urgencyReason, highType = null;
    if (highHits.length) {
      urgency = "hoch";
      var order = ["sicherheit", "blockade", "finanziell"];
      highHits.sort(function (a, b) { return order.indexOf(a.type) - order.indexOf(b.type); });
      highType = highHits[0].type;
      urgencyReason = "Hoch wegen " + highHits[0].label + " (Treffer: „" + highHits[0].match + "“).";
    } else if (problemHits.length) {
      urgency = "mittel";
      urgencyReason = "Mittel: Es wird ein Problem beschrieben (" + problemHits[0].label + "), aber weder komplette Blockade noch Sicherheitsrisiko noch unmittelbar drohender finanzieller Schaden.";
    } else {
      urgency = "niedrig";
      urgencyReason = "Niedrig: Es wird keine Störung beschrieben (eher Frage oder Hinweis).";
    }

    // Beleg-Zitat: Satz mit dem Hochstufungs-Treffer, sonst der Satz mit den
    // meisten Treffern der gewählten Kategorie, sonst der erste Inhaltssatz.
    var quoteSentence = null, quoteHit = 0;
    if (highHits.length) {
      quoteSentence = content[highHits[0].sentence]; quoteHit = highHits[0].index;
    } else if (catHits[category].length) {
      var counts = {};
      catHits[category].forEach(function (h) { counts[h.sentence] = (counts[h.sentence] || 0) + 1; });
      var bestIdx = null;
      Object.keys(counts).forEach(function (k) { if (bestIdx === null || counts[k] > counts[bestIdx]) bestIdx = k; });
      quoteSentence = content[bestIdx];
      var first = catHits[category].filter(function (h) { return String(h.sentence) === String(bestIdx); })[0];
      quoteHit = first ? first.index : 0;
    } else if (content.length) {
      quoteSentence = content[0];
    } else {
      quoteSentence = sentences[0];
    }
    var quote = buildQuote(quoteSentence, quoteHit);

    var unclear = unclearReasons.length > 0;
    var lowerAll = lower(contentText);
    // Fehlende Falldaten werden nur bei einem Problem (mittel/hoch) erfragt, nie ergänzt.
    var missing = (unclear || urgency === "niedrig") ? [] : missingInfo(category, lowerAll);

    var step;
    if (highType) step = STEPS[category][highType];
    else if (unclear) step = CLARIFY;
    else step = STEPS[category][urgency];
    if (unclear && highType) step += " Zusätzlich: " + CLARIFY;
    if (missing.length) step += (highType ? " Parallel erfragen: " : " Vorher beim Kunden erfragen: ") + missing.join("; ") + ".";

    return {
      status: unclear ? "unclear" : "success",
      category: category,
      urgency: urgency,
      nextStep: step,
      quote: quote,
      unclearReasons: unclearReasons,
      missing: missing,
      injections: injections,
      chars: chars,
      reasoning: {
        scores: scores,
        hits: Object.keys(catHits).reduce(function (acc, c) {
          acc[c] = catHits[c].filter(function (h) { return !h.repeat; }).map(function (h) { return h.label + " („" + h.match + "“)"; });
          return acc;
        }, {}),
        tie: tied.length > 1 ? tied : null,
        urgency: urgencyReason
      }
    };
  }

  var api = { triage: triage, MAX_CHARS: MAX_CHARS, countChars: countChars, splitSentences: splitSentences };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Triage = api;
})(typeof window !== "undefined" ? window : globalThis);
