/**
 * Le refus d'une relance, RENDU.
 *
 * `relancerFormuleForm` renvoie ses six refus — rôle insuffisant, source
 * introuvable, source non clôturée, kind non supporté, relance déjà lancée,
 * erreur générique — vers `…?relance_error=<message>`. Tant qu'aucune page ne
 * lisait ce paramètre, le refus était un clic mort : le commerçant revenait sur
 * sa page inchangée, sans un mot, et recommençait.
 *
 * ── POURQUOI DU JSX, ET RIEN D'AUTRE ──
 *
 * Le message peut recopier des valeurs saisies par le commerçant (le nom d'une
 * animation, par exemple) et il transite par l'URL, donc par n'importe qui
 * sachant en fabriquer une. Interpolé en JSX, React l'échappe : un
 * `<img onerror=…>` s'affiche comme du texte. `dangerouslySetInnerHTML` n'a
 * aucune raison d'apparaître ici, jamais.
 */
export function RelanceErreur({
  message,
}: {
  /** Brut, tel que `searchParams` le rend : une URL répétée donne un tableau. */
  message?: string | string[];
}) {
  // Une URL peut porter le paramètre deux fois (`?relance_error=a&relance_error=b`).
  // Le premier est celui de la redirection ; les suivants sont du bruit ajouté.
  const texte = (Array.isArray(message) ? message[0] : message)?.trim();
  if (!texte) return null;

  return (
    <p
      role="alert"
      className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-sm font-bold text-red-900"
    >
      {texte}
    </p>
  );
}
