/**
 * Реклама за награду: true — игрок досмотрел, награду можно выдавать.
 * Пока заглушка — «просмотр» засчитывается сразу. На этапе Яндекс SDK здесь будет ysdk.adv.showRewardedVideo,
 * остальная игра не изменится.
 */
export async function showRewardedAd(): Promise<boolean> {
  return true
}
