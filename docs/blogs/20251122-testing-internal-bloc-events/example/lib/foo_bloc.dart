import 'package:bloc/bloc.dart';

class FooBloc extends Bloc<FooEvent, FooState> {
  FooBloc() : super(FooState()) {
    on<EventA>(_onEventA);
    on<EventB>(_onEventB);
    on<EventC>(_onEventC);
  }

  void _onEventA(EventA event, Emitter<FooState> emit) {
    add(EventC());
  }

  void _onEventB(EventB event, Emitter<FooState> emit) {
    add(EventC());
  }

  void _onEventC(EventC event, Emitter<FooState> emit) {}
}

abstract class FooEvent {}

class EventA extends FooEvent {}

class EventB extends FooEvent {}

class EventC extends FooEvent {}

class FooState {}
