import 'package:bloc/bloc.dart';
import 'package:bloc_test/bloc_test.dart';
import 'package:example/foo_bloc.dart';
import 'package:test/test.dart';

class _FooBlocObserver extends BlocObserver {
  List<FooEvent> events = [];

  @override
  void onEvent(covariant FooBloc bloc, Object? event) {
    super.onEvent(bloc, event);
    if (event case FooEvent event) events.add(event);
  }
}

void main() {
  late _FooBlocObserver observer;

  setUp(() {
    final previousObserver = Bloc.observer;
    addTearDown(() => Bloc.observer = previousObserver);
    observer = _FooBlocObserver();
    Bloc.observer = observer;
  });

  blocTest<FooBloc, FooState>(
    'EventA adds EventC',
    build: () => FooBloc(),
    act: (bloc) => bloc.add(EventA()),
    verify: (bloc) {
      // _TestBlocObserver with _localObserver of type _FooBlocObserver.
      Bloc.observer;

      // _TestBlocObserver does not forward onEvent to _localObserver, only
      // forwards onError.
      expect(observer.events, containsOnce(isA<EventC>())); // Fails
    },
  );
}
