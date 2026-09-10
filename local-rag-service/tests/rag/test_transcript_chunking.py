import random
import unittest

from helpers import WordCounter, VIDEO
from app.transcript.models import TranscriptSegment as Segment
from app.transcript.normalizer import normalize_segment, normalize_text
from app.transcript.processor import process_transcript
from app.transcript.merger import merge_short_segments
from app.chunking.chunker import chunk_transcript
from app.chunking.config import ChunkingConfig


class TranscriptTests(unittest.TestCase):
    def test_normalizes_accents_and_controls_without_mutating_source(self):
        source = Segment("  Tiếng\x00 Việt\n có dấu. ", 10, 15, 0)
        actual = normalize_segment(source, 60)
        self.assertEqual(actual.text, "Tiếng Việt có dấu.")
        self.assertEqual((actual.start_sec, actual.end_sec), (10, 15))
        self.assertIn("\x00", source.text)
        self.assertEqual(normalize_text("a\ufffdb"), "a b")

    def test_invalid_times_and_position(self):
        cases = [(10, 15, float("inf"), 0), (float("nan"), 15, 60, 0),
                 (0, float("inf"), 60, 0), (15, 10, 60, 0), (-1, 5, 60, 0),
                 (1, 70, 60, 0), (0, 1, 0, 0), (0, 1, 60, -1), (0, 1, 60, True)]
        for start, end, duration, position in cases:
            with self.subTest(values=(start, end, duration, position)), self.assertRaises(ValueError):
                normalize_segment(Segment("text", start, end, position), duration)

    def test_zero_duration_segment_is_valid(self):
        self.assertEqual(normalize_segment(Segment("text", 10, 10, 0), 60).end_sec, 10)

    def test_empty_single_segment_is_invalid(self):
        with self.assertRaises(ValueError):
            normalize_segment(Segment(" \n ", 0, 1, 0), 60)

    def test_processor_discards_exact_noise_but_keeps_meaningful_brackets(self):
        segments = [Segment("[Music]", 0, 1, 0), Segment("   ", 1, 2, 1),
                    Segment("Use [index] to access a list.", 2, 3, 2)]
        self.assertEqual(process_transcript(segments, 60), [segments[-1]])
        with self.assertRaises(ValueError):
            process_transcript(segments[:2], 60)
        with self.assertRaises(ValueError):
            process_transcript([], 60)

    def test_order_including_discarded_segments(self):
        for tail in (Segment("text", 8, 12, 1), Segment("", 11, 12, 0)):
            with self.assertRaises(ValueError):
                process_transcript([Segment("first", 10, 15, 0), tail], 60)
        good = [Segment("first", 10, 15, 0), Segment("second", 14, 20, 3)]
        self.assertEqual(process_transcript(good, 60), good)

    def test_merge_preserves_max_end_and_respects_gap(self):
        segments = [Segment("a", 0, 10, 0), Segment("b", 1, 2, 1), Segment("c", 30, 35, 2)]
        merged = merge_short_segments(segments)
        self.assertEqual([(s.text, s.start_sec, s.end_sec) for s in merged], [("a b", 0, 10), ("c", 30, 35)])


class ChunkingTests(unittest.TestCase):
    def chunks(self, segments, size=4, overlap=0):
        return chunk_transcript(segments, VIDEO, "vi", "v1", WordCounter(),
                                ChunkingConfig(max_tokens=size, overlap_tokens=overlap))

    def test_long_segment_has_no_text_loss_or_invented_timestamp(self):
        text = " ".join(f"word{i}" for i in range(31))
        result = self.chunks([Segment(text, 10, 60, 0)])
        self.assertEqual(" ".join(c.text for c in result), text)
        self.assertTrue(all((c.start_sec, c.end_sec) == (10, 60) for c in result))

    def test_overlap_is_whole_fragments_and_loop_advances(self):
        segments = [Segment(f"word{i}", i, i + 1, i) for i in range(7)]
        result = self.chunks(segments, overlap=2)
        self.assertEqual([c.text for c in result], ["word0 word1 word2 word3", "word2 word3 word4 word5", "word4 word5 word6"])

    def test_silence_splits_chunks_and_does_not_overlap(self):
        result = self.chunks([Segment("first", 0, 2, 0), Segment("second", 50, 60, 1)], overlap=2)
        self.assertEqual([c.text for c in result], ["first", "second"])

    def test_nested_timestamp_uses_maximum_end(self):
        result = self.chunks([Segment("a", 0, 10, 0), Segment("b", 1, 2, 1)])
        self.assertEqual(result[0].end_sec, 10)

    def test_identity_is_stable_and_changes_with_content(self):
        a = self.chunks([Segment("first", 0, 2, 0)])
        self.assertEqual(a, self.chunks([Segment("first", 0, 2, 0)]))
        self.assertNotEqual(a[0].chunk_id, self.chunks([Segment("second", 0, 2, 0)])[0].chunk_id)

    def test_invalid_configuration(self):
        for size, overlap in ((0, 0), (4, 4), (4, -1)):
            with self.assertRaises(ValueError):
                ChunkingConfig(max_tokens=size, overlap_tokens=overlap)

    def test_randomized_order_coverage_and_budget_without_overlap(self):
        randomizer = random.Random(42)
        for _ in range(100):
            words = [f"w{i}" for i in range(randomizer.randint(1, 100))]
            segments = [Segment(" ".join(words[i:i + 7]), i, i + 7, i) for i in range(0, len(words), 7)]
            chunks = self.chunks(segments, size=randomizer.randint(4, 20))
            self.assertEqual(" ".join(c.text for c in chunks).split(), words)
            self.assertTrue(all(c.start_sec <= c.end_sec for c in chunks))


if __name__ == "__main__":
    unittest.main()
