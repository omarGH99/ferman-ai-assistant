import React from "react";
import type { WidgetKey } from "../../state/WidgetPrefsProvider";
import { WeatherCard } from "./WeatherCard";
import { ForecastCard } from "./ForecastCard";
import { AirQualityCard } from "./AirQualityCard";
import { TasksCard } from "./TasksCard";
import { UpcomingCard } from "./UpcomingCard";
import { ShoppingCard } from "./ShoppingCard";
import { WaterCard } from "./WaterCard";
import { PrayerCard } from "./PrayerCard";
import { HolidaysCard } from "./HolidaysCard";
import { CurrencyCard } from "./CurrencyCard";
import { CryptoCard } from "./CryptoCard";
import { NewsCard } from "./NewsCard";
import { TrendingCard } from "./TrendingCard";
import { HistoryCard } from "./HistoryCard";

/** key -> component, so the feed can be rendered from the user's saved layout
 * instead of a hardcoded sequence of JSX. Every card takes `half` and forwards
 * it to FeedCard, which is what makes a widget placeable either way. */
export const WIDGET_COMPONENTS: Record<WidgetKey, React.ComponentType<{ half?: boolean }>> = {
  weather: WeatherCard,
  forecast: ForecastCard,
  air: AirQualityCard,
  tasks: TasksCard,
  upcoming: UpcomingCard,
  shopping: ShoppingCard,
  water: WaterCard,
  prayer: PrayerCard,
  holidays: HolidaysCard,
  currency: CurrencyCard,
  crypto: CryptoCard,
  news: NewsCard,
  trending: TrendingCard,
  history: HistoryCard,
};
