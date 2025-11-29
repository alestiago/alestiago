void main() {
  const int iterations = 50 * 1000 * 1000 * 10;
  compute(iterations);
}

@pragma('vm:never-inline')
int consume(int x) => x.hashCode;

int compute(int iterations) {
  (int, int) tuple = (0, 1);

  int t = 0;
  for (int i = 0; i < iterations; i++) {
    t += tuple.$1 + tuple.$2;
    consume(t);
  }
  return t;
}
