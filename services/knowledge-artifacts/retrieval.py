"""
Real lexical retrieval for artefact search.

Why TF-IDF + cosine similarity instead of embeddings:
  This service's only configured LLM backend (see services/llm_client.py /
  the root .env) exposes a single Azure OpenAI chat-completions deployment
  (AZURE_MODEL_NAME="grok-4.1-fast-reasoning", used via call_gemini). There
  is no AZURE_OPENAI_EMBEDDING_DEPLOYMENT (or equivalent) configured, and no
  embeddings-capable endpoint is available in this environment. Rather than
  fake a vector search against a call that doesn't exist, this module
  implements a real, honest, dependency-light lexical retrieval mechanism:
  classic TF-IDF vectorization with cosine similarity ranking. It genuinely
  ranks indexed artefacts by textual relevance to a query before the top-K
  matches are handed to the LLM for answer synthesis.

No new heavy dependencies: numpy is already installed in this environment
and is used only for the vector math (dot products / norms). scikit-learn
is NOT used/added — it was not present in requirements.txt or installed,
and a from-scratch TF-IDF is simple enough not to warrant it.
"""

import math
import re
from collections import Counter
from typing import Dict, List, Sequence
# Pure Python TF-IDF without numpy dependency

_TOKEN_RE = re.compile(r"[A-Za-z0-9]+")

# Small, generic English stopword list — kept local so this module has no
# external data-file dependency.
_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "if", "then", "else", "of", "to",
    "in", "on", "for", "with", "as", "by", "at", "is", "are", "was", "were",
    "be", "been", "being", "it", "this", "that", "these", "those", "we",
    "you", "your", "our", "i", "he", "she", "they", "them", "his", "her",
    "its", "their", "from", "into", "about", "what", "which", "who", "whom",
    "will", "would", "can", "could", "should", "do", "does", "did", "not",
    "no", "so", "than", "too", "very", "just", "up", "out", "over", "under",
    "again", "further", "here", "there", "when", "where", "why", "how", "all",
    "any", "both", "each", "few", "more", "most", "other", "some", "such",
    "only", "own", "same", "s", "t", "don", "now",
}


def _tokenize(text: str) -> List[str]:
    if not text:
        return []
    return [
        tok for tok in _TOKEN_RE.findall(text.lower())
        if tok not in _STOPWORDS and len(tok) > 1
    ]


def _artefact_text(artefact: Dict) -> str:
    """Concatenate the fields worth searching over for a given artefact."""
    parts = [
        artefact.get("name") or "",
        artefact.get("type") or "",
        artefact.get("content") or "",
    ]
    return "\n".join(p for p in parts if p)


def rank_artefacts_by_relevance(
    query: str,
    artefacts: Sequence[Dict],
    top_k: int = 5,
) -> List[Dict]:
    """
    Rank artefacts by TF-IDF cosine similarity to `query` and return the
    top_k most relevant ones (each augmented with a `_relevance_score`
    float in [0, 1]).

    This is real retrieval: term frequencies are computed per document,
    inverse document frequency across the whole artefact corpus (+ the
    query, treated as one more "document" for IDF smoothing), and the
    final ranking score is the cosine similarity between the query vector
    and each artefact's vector in that TF-IDF space.

    If there are no artefacts, or the query has no usable tokens, this
    degrades gracefully to returning the first `top_k` artefacts unranked
    (score 0.0) rather than raising — search should still work, just
    without meaningful ranking, in that edge case.
    """
    artefacts = list(artefacts)
    if not artefacts:
        return []

    query_tokens = _tokenize(query)
    doc_tokens = [_tokenize(_artefact_text(a)) for a in artefacts]

    if not query_tokens or not any(doc_tokens):
        # Nothing to rank on lexical term overlap — fall back to insertion order.
        for a in artefacts[:top_k]:
            a = dict(a)
            a["_relevance_score"] = 0.0
        return [dict(a, _relevance_score=0.0) for a in artefacts[:top_k]]

    # Corpus = each artefact's tokens, plus the query itself, so the query's
    # own vocabulary is represented in the IDF weighting.
    corpus = doc_tokens + [query_tokens]
    n_docs = len(corpus)

    vocab = sorted({tok for tokens in corpus for tok in tokens})
    vocab_index = {tok: i for i, tok in enumerate(vocab)}

    # Document frequency per term.
    df = [0.0] * len(vocab)
    for tokens in corpus:
        for tok in set(tokens):
            df[vocab_index[tok]] += 1.0

    # Smoothed IDF (add-one smoothing avoids div-by-zero / negative values).
    idf = [math.log((1 + n_docs) / (1 + df_val)) + 1.0 for df_val in df]

    def _tfidf_vector(tokens: List[str]) -> List[float]:
        vec = [0.0] * len(vocab)
        if not tokens:
            return vec
        counts = Counter(tokens)
        total = len(tokens)
        for tok, cnt in counts.items():
            tf = cnt / total
            vec[vocab_index[tok]] = tf * idf[vocab_index[tok]]
        
        # Calculate Euclidean L2 norm
        sq_sum = sum(x * x for x in vec)
        norm = math.sqrt(sq_sum)
        if norm > 0:
            vec = [x / norm for x in vec]
        return vec

    query_vec = _tfidf_vector(query_tokens)
    scored = []
    for artefact, tokens in zip(artefacts, doc_tokens):
        doc_vec = _tfidf_vector(tokens)
        
        # Dot product
        score = sum(q * d for q, d in zip(query_vec, doc_vec))
        if not math.isfinite(score):
            score = 0.0
        scored.append((score, artefact))

    scored.sort(key=lambda pair: pair[0], reverse=True)

    ranked = []
    for score, artefact in scored[:top_k]:
        item = dict(artefact)
        item["_relevance_score"] = round(score, 4)
        ranked.append(item)
    return ranked
