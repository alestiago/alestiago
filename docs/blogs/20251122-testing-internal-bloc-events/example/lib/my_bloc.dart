import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:example/user_repository.dart';

class MyBloc extends Bloc<MyEvent, MyState> {
  MyBloc({required UserRepository userRepository}) : super(MyState()) {
    on<EventA>(_onEventA);
    on<EventB>(_onEventB);
    _userSubscription = userRepository.user.listen(
      (user) => add(EventB()),
    );
  }

  late final StreamSubscription<String> _userSubscription;

  void _onEventA(EventA event, Emitter<MyState> emit) => add(EventB());

  void _onEventB(EventB event, Emitter<MyState> emit) {}

  @override
  Future<void> close() {
    _userSubscription.cancel();
    return super.close();
  }
}

abstract class MyEvent {}

class EventA extends MyEvent {}

class EventB extends MyEvent {}

class MyState {}
